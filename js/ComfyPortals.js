// ComfyUI/custom_nodes/ComfyPortals/js/ComfyPortals.js
import { app } from "/scripts/app.js";
import { initializePortalManagerUI, portalManagerPanelInstance as panelInstanceFromModule } from "./portal_manager_ui.js";

console.log("[ComfyPortals.JS] Script loading (v24.3 - Floating Button, STRING GetPortal Fix).");

let portalPanelInstance;

// --- Utility: Get Portal Name from widget ---
function getPortalNameFromNodeWidget(nodeInstance) {
    if (nodeInstance?.widgets) {
        const widget = nodeInstance.widgets.find(w => w.name === "portal_name");
        if (widget?.value && String(widget.value).trim() !== "" &&
            !String(widget.value).startsWith("_")) {
            return String(widget.value).trim();
        }
    }
    return null;
}

// --- Utility: Update SetNamedPortal's stored type and UI ---
function updateSetPortalInfo(nodeInstance) {
    if (nodeInstance?.comfyClass !== "SetNamedPortal" || !nodeInstance.inputs) return;
    const valueSlotIndex = nodeInstance.inputs.findIndex(inp => inp.name === "value");
    if (valueSlotIndex === -1) return;

    const inputSlot = nodeInstance.inputs[valueSlotIndex];
    let determinedType = "*";
    if (inputSlot.link != null && app.graph.links[inputSlot.link]) {
        const linkToSetPortal = app.graph.links[inputSlot.link];
        const originNode = app.graph.getNodeById(linkToSetPortal.origin_id);
        if (originNode?.outputs?.[linkToSetPortal.origin_slot]) {
            determinedType = originNode.outputs[linkToSetPortal.origin_slot].type || "*";
            if (linkToSetPortal.type !== determinedType) linkToSetPortal.type = determinedType;
        }
    }
    nodeInstance._actualDataType = determinedType;
    inputSlot.label = `value (${determinedType})`;
    nodeInstance.setDirtyCanvas(true, true);
}

// --- Portal Name Management ---
let lastKnownPortalNamesForDropdown = [];
const PLACEHOLDER_NO_PORTALS = "_no_portals_found_";
const PLACEHOLDER_REFRESH = "_refresh_or_no_portals_"; // Should match Python default

// --- Central function to refresh all portal-related UI elements ---
function refreshAllPortalVisuals() {
    if (!app.graph) {
        // console.warn("[ComfyPortals] refreshAllPortalVisuals: app.graph not ready.");
        return;
    }

    const setNodes = app.graph._nodes.filter(n =>
        n.comfyClass === "SetNamedPortal" &&
        n.mode !== LiteGraph.NODE_MODE_BYPASSED &&
        n.mode !== 2 // Muted/Never mode
    );

    const activePortalsDataForPanel = [];
    const portalNamesForDropdownSet = new Set();

    setNodes.forEach(setNode => {
        const name = getPortalNameFromNodeWidget(setNode);
        if (name) {
            portalNamesForDropdownSet.add(name);
            activePortalsDataForPanel.push({
                name: name,
                type: setNode._actualDataType || (setNode.inputs?.find(i=>i.name==="value")?.type) || "*"
            });
        }
    });

    activePortalsDataForPanel.sort((a, b) => a.name.localeCompare(b.name));

    const sortedPortalNamesArray = Array.from(portalNamesForDropdownSet).sort();
    let finalDropdownNames = sortedPortalNamesArray.length > 0 ? sortedPortalNamesArray : [PLACEHOLDER_REFRESH]; // Use REFRESH placeholder

    if (JSON.stringify(lastKnownPortalNamesForDropdown) !== JSON.stringify(finalDropdownNames)) {
        lastKnownPortalNamesForDropdown = finalDropdownNames;
        const getNodes = app.graph._nodes.filter(n => n.comfyClass === "GetNamedPortal");
        getNodes.forEach(getNode => {
            const widget = getNode.widgets.find(w => w.name === "portal_name");
            // Ensure widget is treated as combo even if Python defines it as STRING
            if (widget && (widget.type === "combo" || widget.type === "string")) { // Allow string type too
                const currentValue = widget.value;
                if (widget.options) { // Combo widgets have .options
                    widget.options.values = [...finalDropdownNames];
                } else { // For string widgets we might not be able to change options directly, but refreshAllVisuals will be called on node create/load
                    // If it was forced to a combo in nodeCreated/loadedGraphNode, this branch might not be hit often for 'string'
                }

                if (finalDropdownNames.includes(currentValue)) {
                    widget.value = currentValue;
                } else if (finalDropdownNames.length > 0) {
                    widget.value = finalDropdownNames[0];
                } else { // Should be PLACEHOLDER_REFRESH
                    widget.value = PLACEHOLDER_REFRESH;
                }
                // Litegraph widgets usually redraw themselves on value change,
                // but if not, getNode.setDirtyCanvas(true, false); might be needed here.
            }
        });
    }

    if (portalPanelInstance) {
        portalPanelInstance.updateList(activePortalsDataForPanel);
    }
}

// --- Temporary Link Management ---
function createTemporaryPortalLinks(virtualPortalConnections) {
    const added_temp_link_ids = [];
    const original_links_to_restore = [];

    for (const vpc of virtualPortalConnections) {
        const sourceNode = app.graph.getNodeById(vpc.sourceNodeId);
        const destNode = app.graph.getNodeById(vpc.destNodeId);
        if (!sourceNode || !destNode) continue;

        const destInputSlot = destNode.inputs[vpc.destSlotIndex];
        if (destInputSlot && destInputSlot.link != null) {
            const originalLink = app.graph.links[destInputSlot.link];
            if (originalLink && originalLink.origin_id === vpc.getPortalNodeId && originalLink.origin_slot === vpc.getPortalNodeOutputSlotIndex) {
                original_links_to_restore.push(JSON.parse(JSON.stringify(originalLink)));
            }
        }
        const temp_link_obj = sourceNode.connect(vpc.sourceSlotIndex, destNode, vpc.destSlotIndex);
        if (temp_link_obj && typeof temp_link_obj.id !== 'undefined') {
            if (app.graph.links[temp_link_obj.id] && app.graph.links[temp_link_obj.id].type !== vpc.linkType) {
                 app.graph.links[temp_link_obj.id].type = vpc.linkType;
            }
            added_temp_link_ids.push(temp_link_obj.id);
        }
    }
    const restorer = function() {
        for (const id of added_temp_link_ids) {
            if (app.graph.links[id]) app.graph.removeLink(id);
        }
        for (const linkData of original_links_to_restore) {
            const oNode = app.graph.getNodeById(linkData.origin_id);
            const tNode = app.graph.getNodeById(linkData.target_id);
            if (oNode && tNode && !tNode.inputs[linkData.target_slot].link) {
                oNode.connect(linkData.origin_slot, tNode, linkData.target_slot);
            }
        }
    };
    return { restorer: restorer, added_links: added_temp_link_ids };
}

// --- Main Extension ---
app.registerExtension({
    name: "Comfy.ComfyPortals.JS.v24.3", // Version for this iteration

    async beforeRegisterNodeDef(nodeType, nodeData, appInstance) {
        if (nodeData.name === "Set Named Portal (Input)") {
            const originalOnConnectionsChange = nodeType.prototype.onConnectionsChange;
            nodeType.prototype.onConnectionsChange = function(side, slotIndex, isConnected, linkInfo, ioSlot) {
                originalOnConnectionsChange?.apply(this, arguments);
                if (this.comfyClass === "SetNamedPortal" && side === LiteGraph.INPUT && this.inputs[slotIndex]?.name === "value") {
                    updateSetPortalInfo(this);
                    setTimeout(refreshAllPortalVisuals, 0);
                }
            };
        }
    },

    async nodeCreated(node, appInstance) {
        if (node.comfyClass === "SetNamedPortal") {
            setTimeout(() => {
                updateSetPortalInfo(node);
                refreshAllPortalVisuals();
            }, 50);
            const portalNameWidget = node.widgets.find(w => w.name === "portal_name");
            if (portalNameWidget) {
                const originalWidgetCallback = portalNameWidget.callback;
                portalNameWidget.callback = (value, ...args) => {
                    if (originalWidgetCallback) originalWidgetCallback.call(node, value, ...args);
                    setTimeout(refreshAllPortalVisuals, 0);
                };
            }
        } else if (node.comfyClass === "GetNamedPortal") {
            let portalNameWidget = node.widgets.find(w => w.name === "portal_name");
            const currentValue = portalNameWidget ? portalNameWidget.value : PLACEHOLDER_REFRESH;

            if (!portalNameWidget || portalNameWidget.type !== "combo") {
                const widgetIndex = portalNameWidget ? node.widgets.indexOf(portalNameWidget) : -1;
                if (widgetIndex > -1) {
                    node.widgets.splice(widgetIndex, 1);
                }
                // Add as a combo widget. LiteGraph will handle its appearance.
                // The actual values will be populated by refreshAllPortalVisuals.
                node.addWidget("combo", "portal_name", currentValue, () => {}, {
                    values: [currentValue] // Initial value for the combo
                });
                console.log(`[ComfyPortals] GetNamedPortal ${node.id}: portal_name widget ensured/created as COMBO.`);
            }

            if (!node.widgets?.find(w => w.name === "Refresh List")) {
                node.addWidget("button", "Refresh List", null, () => {
                    refreshAllPortalVisuals();
                }, {});
            }
            setTimeout(refreshAllPortalVisuals, 50); // Populate/refresh its dropdown
        }
    },

    async loadedGraphNode(node, appInstance) {
        if (node.comfyClass === "SetNamedPortal") {
            setTimeout(() => updateSetPortalInfo(node), 100);
            const portalNameWidget = node.widgets.find(w => w.name === "portal_name");
            if (portalNameWidget && (!portalNameWidget.callback || !portalNameWidget.callback.toString().includes("refreshAllPortalVisuals"))) {
                const originalWidgetCallback = portalNameWidget.callback;
                portalNameWidget.callback = (value, ...args) => {
                    if (originalWidgetCallback) originalWidgetCallback.call(node, value, ...args);
                    setTimeout(refreshAllPortalVisuals, 0);
                };
            }
        } else if (node.comfyClass === "GetNamedPortal") {
            let portalNameWidget = node.widgets.find(w => w.name === "portal_name");
            const loadedValue = portalNameWidget ? portalNameWidget.value : PLACEHOLDER_REFRESH;

            if (!portalNameWidget || portalNameWidget.type !== "combo") {
                const widgetIndex = portalNameWidget ? node.widgets.indexOf(portalNameWidget) : -1;
                if (widgetIndex > -1) {
                    node.widgets.splice(widgetIndex, 1);
                }
                node.addWidget("combo", "portal_name", loadedValue, () => {}, {
                    values: [loadedValue] // Use the loaded value as the initial item
                });
                console.log(`[ComfyPortals] GetNamedPortal ${node.id} (loaded): portal_name widget ensured/created as COMBO.`);
            }

            if (!node.widgets?.find(w => w.name === "Refresh List")) {
                node.addWidget("button", "Refresh List", null, () => refreshAllPortalVisuals(), {});
            }
            // The main refresh in setup will populate it correctly after all nodes are loaded.
        }
    },

    async setup(appInstance) {
        console.log("[ComfyPortals] Setting up with Floating Button (v24.3).");

        try {
            portalPanelInstance = initializePortalManagerUI();
            if (!portalPanelInstance) {
                console.error("[ComfyPortals] Failed to initialize PortalManagerPanel instance.");
                return;
            }
        } catch (e) { console.error("[ComfyPortals] Error initializing PortalManagerPanel:", e); return; }

        const floatingButton = document.createElement("button");
        floatingButton.id = "comfyportals-floating-toggle-button";
        floatingButton.textContent = "PORTAL";
        floatingButton.title = "Toggle Portals List";
        Object.assign(floatingButton.style, { /* ... your floating button styles ... */
            position: 'fixed', top: '100px', right: '300px', zIndex: '1005',
            padding: '10px 15px', backgroundColor: 'var(--comfy-menu-bg)', color: 'var(--fg-color)',
            border: '1px solid var(--border-color)', borderRadius: '10%', cursor: 'pointer',
            boxShadow: '0px 2px 10px rgba(0,0,0,0.3)', fontSize: '16px',
            width: '90px', height: '45px', display: 'flex', alignItems: 'center', justifyContent: 'center'
        });
        floatingButton.onclick = () => { /* ... toggle panel and refresh ... */
            if (portalPanelInstance) {
                portalPanelInstance.toggle();
                if (portalPanelInstance.element.style.display !== "none") {
                    refreshAllPortalVisuals();
                }
            }
        };
        // Draggable logic for floatingButton (as previously defined)
        let isDraggingButton = false, btnOffsetX, btnOffsetY;
        floatingButton.onmousedown = (e) => { isDraggingButton = true; floatingButton.style.cursor = 'grabbing'; btnOffsetX = e.clientX - floatingButton.offsetLeft; btnOffsetY = e.clientY - floatingButton.offsetTop; document.body.style.userSelect = 'none'; e.preventDefault(); };
        document.onmousemove = (e) => { if (!isDraggingButton) return; floatingButton.style.left = `${e.clientX - btnOffsetX}px`; floatingButton.style.top = `${e.clientY - btnOffsetY}px`; };
        document.onmouseup = () => { if (isDraggingButton) { isDraggingButton = false; floatingButton.style.cursor = 'pointer'; document.body.style.userSelect = ''; }};

        try {
            document.body.appendChild(floatingButton);
            console.log("[ComfyPortals] Floating 'Portals' button added.");
        } catch (e) { console.error("[ComfyPortals] Error appending floating button:", e); }

        try {
            const originalOnNodeRemoved = LGraph.prototype.onNodeRemoved;
            LGraph.prototype.onNodeRemoved = function(node) {
                const res = originalOnNodeRemoved?.apply(this, arguments);
                if (node && node.comfyClass === "SetNamedPortal") {
                    setTimeout(refreshAllPortalVisuals, 0);
                }
                return res;
            };
            console.log("[ComfyPortals] onNodeRemoved patched.");
        } catch (e) { console.error("[ComfyPortals] Error patching onNodeRemoved:", e); }

        try {
            const originalGraphToPrompt = app.graphToPrompt;
            if (!originalGraphToPrompt) { console.error("[ComfyPortals] original app.graphToPrompt not defined!"); }
            else {
                app.graphToPrompt = async function() {
                    const currentGraph = app.graph;
                    if (!currentGraph) { console.error("[ComfyPortals] app.graph not in graphToPrompt. Calling original."); return await originalGraphToPrompt.apply(app, arguments); }

                    const NODE_MODE_BYPASSED = LiteGraph.NODE_MODE_BYPASSED || 4;
                    const NODE_MODE_NEVER = 2;
                    const liveGetters = currentGraph._nodes.filter(n => n.comfyClass === "GetNamedPortal" && n.mode !== NODE_MODE_BYPASSED && n.mode !== NODE_MODE_NEVER);
                    const liveSetters = currentGraph._nodes.filter(n => n.comfyClass === "SetNamedPortal" && n.mode !== NODE_MODE_BYPASSED && n.mode !== NODE_MODE_NEVER);
                    const virtualPortalConnections = [];

                    for (const getNode of liveGetters) {
                        const portalName = getPortalNameFromNodeWidget(getNode);
                        if (!portalName || portalName === PLACEHOLDER_NO_PORTALS || portalName === PLACEHOLDER_REFRESH) continue;
                        const setNode = liveSetters.find(s => getPortalNameFromNodeWidget(s) === portalName);
                        if (!setNode) { console.warn(`[ComfyPortals] No active SetPortal for '${portalName}' (GetNode ${getNode.id})`); continue; }
                        const setNodeValueInput = setNode.inputs?.find(i => i.name === "value");
                        if (!setNodeValueInput?.link) continue;
                        let sourceLink = currentGraph.links[setNodeValueInput.link];
                        if (!sourceLink) continue;
                        if (currentGraph.handle_bypass) sourceLink = currentGraph.handle_bypass(sourceLink) || sourceLink;
                        if (!sourceLink) continue;
                        const trueSourceNode = currentGraph.getNodeById(sourceLink.origin_id);
                        const trueSourceSlotIndex = sourceLink.origin_slot;
                        const actualDataType = setNode._actualDataType || trueSourceNode?.outputs?.[trueSourceSlotIndex]?.type || "*";
                        if (!trueSourceNode || typeof trueSourceSlotIndex === 'undefined') continue;
                        const getNodeValueOutput = getNode.outputs?.find(o => o.name === "value");
                        if (!getNodeValueOutput?.links?.length) continue;
                        for (const outLinkIdx of getNodeValueOutput.links) {
                            const persistentLink = currentGraph.links[outLinkIdx];
                            if (!persistentLink) continue;
                            const trueDestNode = currentGraph.getNodeById(persistentLink.target_id);
                            const trueDestSlotIndex = persistentLink.target_slot;
                            if (trueDestNode && typeof trueDestSlotIndex !== 'undefined' && trueDestNode.mode !== NODE_MODE_BYPASSED && trueDestNode.mode !== NODE_MODE_NEVER) {
                                virtualPortalConnections.push({
                                    sourceNodeId: trueSourceNode.id, sourceSlotIndex: trueSourceSlotIndex,
                                    destNodeId: trueDestNode.id, destSlotIndex: trueDestSlotIndex,
                                    linkType: actualDataType, getPortalNodeId: getNode.id,
                                    getPortalNodeOutputSlotIndex: getNode.outputs.indexOf(getNodeValueOutput)
                                });
                            }
                        }
                    }
                    const linkMods = createTemporaryPortalLinks(virtualPortalConnections);
                    let promptResult;
                    try { promptResult = await originalGraphToPrompt.apply(app, arguments); }
                    finally { linkMods.restorer(); if(app.graph) app.graph.setDirtyCanvas(true,true); }
                    return promptResult;
                };
                console.log("[ComfyPortals] app.graphToPrompt patched.");
            }
        } catch (e) { console.error("[ComfyPortals] Error patching app.graphToPrompt:", e); }

        try {
            setTimeout(() => {
                if (app.graph) { refreshAllPortalVisuals(); }
                else { console.warn("[ComfyPortals] app.graph not ready for initial refresh. Relies on node interactions."); }
            }, 1000);
        } catch (e) { console.error("[ComfyPortals] Error in initial refreshAllPortalVisuals timeout:", e); }

        console.log("[ComfyPortals] Floating button setup complete.");
    }
});
console.log("[ComfyPortals.JS] Script loaded (v24.3 - Floating Button, STRING GetPortal Fix - at end).");