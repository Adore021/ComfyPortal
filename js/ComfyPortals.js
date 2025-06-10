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
    if (!app.graph) return;

    const allNodes = app.graph._nodes;
    const NODE_MODE_BYPASSED = LiteGraph.NODE_MODE_BYPASSED || 4;
    const NODE_MODE_NEVER = 2; // Muted/Never mode

    // 1. Find all active SetNamedPortal nodes and their names/types
    const activeSetters = allNodes.filter(n =>
        n.comfyClass === "SetNamedPortal" &&
        n.mode !== NODE_MODE_BYPASSED &&
        n.mode !== NODE_MODE_NEVER
    );

    const availableSetPortals = new Map(); // Store as Map: { portalName: portalType }
    activeSetters.forEach(setNode => {
        const name = getPortalNameFromNodeWidget(setNode);
        if (name) {
            const type = setNode._actualDataType || (setNode.inputs?.find(i=>i.name==="value")?.type) || "*";
            availableSetPortals.set(name, type);
        }
    });

    // 2. Find all active GetNamedPortal nodes and the names they are requesting
    const activeGetters = allNodes.filter(n =>
        n.comfyClass === "GetNamedPortal" &&
        n.mode !== NODE_MODE_BYPASSED &&
        n.mode !== NODE_MODE_NEVER
    );

    const requestedPortalNames = new Set();
    activeGetters.forEach(getNode => {
        const name = getPortalNameFromNodeWidget(getNode);
        if (name && name !== PLACEHOLDER_REFRESH && name !== PLACEHOLDER_NO_PORTALS) {
            requestedPortalNames.add(name);
        }
    });

    // 3. Determine "Used" portals for the panel (intersection of set and requested)
    const usedPortalsDataForPanel = [];
    requestedPortalNames.forEach(requestedName => {
        if (availableSetPortals.has(requestedName)) {
            usedPortalsDataForPanel.push({
                name: requestedName,
                type: availableSetPortals.get(requestedName)
            });
        }
    });
    usedPortalsDataForPanel.sort((a, b) => a.name.localeCompare(b.name));

    // 4. Update Portal Manager Panel with ONLY used portals
    if (portalPanelInstance) {
        portalPanelInstance.updateList(usedPortalsDataForPanel);
    }

    // 5. Update GetPortal Dropdowns with ALL available Set portal names
    // (Dropdowns should still show all *definable* portals, not just currently used ones)
    const allAvailablePortalNamesArray = Array.from(availableSetPortals.keys()).sort();
    let finalDropdownNames = allAvailablePortalNamesArray.length > 0 ? allAvailablePortalNamesArray : [PLACEHOLDER_REFRESH];

    if (JSON.stringify(lastKnownPortalNamesForDropdown) !== JSON.stringify(finalDropdownNames)) {
        lastKnownPortalNamesForDropdown = finalDropdownNames;
        const getNodesForDropdownUpdate = allNodes.filter(n => n.comfyClass === "GetNamedPortal");
        getNodesForDropdownUpdate.forEach(getNode => {
            const widget = getNode.widgets.find(w => w.name === "portal_name");
            if (widget && (widget.type === "combo" || widget.type === "string")) {
                const originalValue = widget.value; // Store original value before changing options
                let valueChanged = false;

                if (widget.options) {
                    // Check if options actually need updating to avoid unnecessary redraws if only value changes
                    if (JSON.stringify(widget.options.values) !== JSON.stringify(finalDropdownNames)) {
                        widget.options.values = [...finalDropdownNames];
                        // If options changed, the current value might become invalid, so we might need to reset it.
                        // This logic below will handle that.
                    }
                } else if (widget.type === "combo") { // Combo widget somehow lost its options
                    widget.options = { values: [...finalDropdownNames] };
                }


                if (finalDropdownNames.includes(originalValue)) {
                    if (widget.value !== originalValue) { // If it was somehow different
                        widget.value = originalValue;
                        valueChanged = true;
                    }
                } else if (finalDropdownNames.length > 0) {
                    if (widget.value !== finalDropdownNames[0]) {
                        widget.value = finalDropdownNames[0];
                        valueChanged = true;
                    }
                } else { // Should be PLACEHOLDER_REFRESH
                    if (widget.value !== PLACEHOLDER_REFRESH) {
                        widget.value = PLACEHOLDER_REFRESH;
                        valueChanged = true;
                    }
                }

                // If the widget's options or value has changed, or if we always want to ensure it's up-to-date visually for new nodes
                // LiteGraph sometimes needs a nudge to redraw the widget itself.
                // Forcing setDirtyCanvas on the node is a common way.
                if (getNode.setDirtyCanvas) {
                     // getNode.setDirtyCanvas(true, true); // Redraw node and its widgets
                     // Forcing a value change (even to itself) on a combo can sometimes trigger its internal redraw.
                     // This is a bit of a hack but can be effective.
                     const tempVal = widget.value;
                     widget.value = null; // Temporarily set to null
                     widget.value = tempVal; // Set it back
                }
            }
        });
    }
    // console.log("[ComfyPortals] RefreshAllPortalVisuals: Complete.");
    lastKnownPortalNamesForDropdown = finalDropdownNames;
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
    name: "Comfy.ComfyPortals.JS.v24.4", // Version for this iteration

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

        // Add onNodeCloned hook for GetNamedPortal
        if (nodeData.name === "Get Named Portal (Output)") {
            nodeType.onNodeCloned = function(originalNode, clonedNode) {
                // originalNode is the node that was cloned
                // clonedNode is the new node that was created from the clone operation

                // console.log(`[ComfyPortals] GetNamedPortal cloned: Original ID ${originalNode.id}, New ID ${clonedNode.id}`);

                // The clonedNode will already go through its own `nodeCreated` lifecycle.
                // In `nodeCreated` for GetNamedPortal, we already:
                // 1. Ensure its portal_name widget is a combo.
                // 2. Attach callbacks.
                // 3. Attempt to populate its dropdown.
                // 4. Call refreshAllPortalVisuals.

                // So, theoretically, nodeCreated should handle most of it.
                // However, if there's a very specific state from the original that needs
                // careful re-initialization on the clone, you could do it here.
                // For now, just ensuring refreshAllPortalVisuals is called might be enough
                // to update the panel if the act of cloning changes the "used" portals.
                // But nodeCreated for the clonedNode should already call it.

                // We can explicitly trigger a refresh for the cloned node's dropdown visuals
                // in case the timing in its nodeCreated isn't perfect for cloned nodes.
                setTimeout(() => {
                    const widget = clonedNode.widgets.find(w => w.name === "portal_name");
                    if (widget && widget.type === "combo") {
                        // Re-fetch latest portal names
                        const setNodes = app.graph._nodes.filter(n => n.comfyClass === "SetNamedPortal" && n.mode !== (LiteGraph.NODE_MODE_BYPASSED || 4) && n.mode !== 2);
                        const availableNames = new Set();
                        setNodes.forEach(setNode => {
                            const name = getPortalNameFromNodeWidget(setNode);
                            if (name) availableNames.add(name);
                        });
                        const sortedNames = Array.from(availableNames).sort();
                        const finalNames = sortedNames.length > 0 ? sortedNames : [PLACEHOLDER_REFRESH];

                        widget.options.values = [...finalNames];
                        if (!finalNames.includes(widget.value)) {
                            widget.value = finalNames[0];
                        }
                        // Force redraw
                        const tempVal = widget.value;
                        widget.value = null;
                        widget.value = tempVal;
                    }
                    // And a global refresh for the panel
                    refreshAllPortalVisuals();
                }, 100); // Slightly longer delay for cloned node to fully initialize
            };
        }
    },

    async nodeCreated(node, appInstance) {
        if (node.comfyClass === "SetNamedPortal") {
            // ... (existing SetNamedPortal logic) ...
        } else if (node.comfyClass === "GetNamedPortal") {
            let portalNameWidgetInstance = node.widgets.find(w => w.name === "portal_name");
            const currentWidgetValue = portalNameWidgetInstance ? portalNameWidgetInstance.value : PLACEHOLDER_REFRESH;
            let isNewWidget = false;

            if (!portalNameWidgetInstance || portalNameWidgetInstance.type !== "combo") {
                const widgetIndex = portalNameWidgetInstance ? node.widgets.indexOf(portalNameWidgetInstance) : -1;
                if (widgetIndex > -1) {
                    node.widgets.splice(widgetIndex, 1);
                }
                portalNameWidgetInstance = node.addWidget("combo", "portal_name", currentWidgetValue, () => {
                    setTimeout(refreshAllPortalVisuals, 0);
                }, { values: [currentWidgetValue] }); // Initialize with current or placeholder
                isNewWidget = true;
                console.log(`[ComfyPortals] GetNamedPortal ${node.id}: portal_name widget ensured/created as COMBO with callback.`);
            } else {
                const originalComboCallback = portalNameWidgetInstance.callback;
                portalNameWidgetInstance.callback = (value, LGraphCanvas, N, pos, event) => {
                    if(originalComboCallback) originalComboCallback.call(node, value, LGraphCanvas, N, pos, event);
                    setTimeout(refreshAllPortalVisuals, 0);
                };
            }

            if (!node.widgets?.find(w => w.name === "Refresh List")) {
                node.addWidget("button", "Refresh List", null, () => {
                    refreshAllPortalVisuals();
                }, {});
            }

            // **Immediately populate this new node's dropdown after ensuring it's a combo**
            // 1. Get current available portal names
            const setNodes = app.graph._nodes.filter(n => n.comfyClass === "SetNamedPortal" && n.mode !== (LiteGraph.NODE_MODE_BYPASSED || 4) && n.mode !== 2);
            const availableNames = new Set();
            setNodes.forEach(setNode => {
                const name = getPortalNameFromNodeWidget(setNode);
                if (name) availableNames.add(name);
            });
            const sortedNames = Array.from(availableNames).sort();
            const finalNames = sortedNames.length > 0 ? sortedNames : [PLACEHOLDER_REFRESH];

            // 2. Update the widget of THIS new node
            portalNameWidgetInstance.options.values = [...finalNames];
            if (!finalNames.includes(portalNameWidgetInstance.value)) { // If current value is invalid (e.g. placeholder)
                portalNameWidgetInstance.value = finalNames[0];
            }

            // 3. Force redraw of this specific node's widget if it was newly created/configured
            //    or if its value/options were just set.
            if (isNewWidget || node.setDirtyCanvas) { // isNewWidget helps for the very first creation
                 const tempVal = portalNameWidgetInstance.value;
                 portalNameWidgetInstance.value = null; // Force internal update in LiteGraph
                 portalNameWidgetInstance.value = tempVal;
                 // node.setDirtyCanvas(true, true); // Might be needed if the above doesn't work
            }


            // This global refresh is still good for other nodes and the panel
            setTimeout(refreshAllPortalVisuals, 50);
        }
    },

    async loadedGraphNode(node, appInstance) {
        if (node.comfyClass === "SetNamedPortal") {
            // ... (SetNamedPortal logic remains the same as v24.3) ...
        } else if (node.comfyClass === "GetNamedPortal") {
            let portalNameWidgetInstance = node.widgets.find(w => w.name === "portal_name");
            const loadedWidgetValue = portalNameWidgetInstance ? portalNameWidgetInstance.value : PLACEHOLDER_REFRESH;

            if (!portalNameWidgetInstance || portalNameWidgetInstance.type !== "combo") {
                const widgetIndex = portalNameWidgetInstance ? node.widgets.indexOf(portalNameWidgetInstance) : -1;
                if (widgetIndex > -1) {
                    node.widgets.splice(widgetIndex, 1);
                }
                portalNameWidgetInstance = node.addWidget("combo", "portal_name", loadedWidgetValue, () => {
                    setTimeout(refreshAllPortalVisuals, 0);
                }, { values: [loadedWidgetValue] });
                console.log(`[ComfyPortals] GetNamedPortal ${node.id} (loaded): portal_name widget ensured/created as COMBO with callback.`);
            } else {
                 // Ensure existing combo has the callback if it was lost during serialization or not set by an older version
                if (!portalNameWidgetInstance.callback || !portalNameWidgetInstance.callback.toString().includes("refreshAllPortalVisuals")) {
                    const originalComboCallback = portalNameWidgetInstance.callback;
                    portalNameWidgetInstance.callback = (value, LGraphCanvas, N, pos, event) => {
                        if(originalComboCallback) originalComboCallback.call(node, value, LGraphCanvas, N, pos, event);
                        setTimeout(refreshAllPortalVisuals, 0);
                    };
                }
            }

            if (!node.widgets?.find(w => w.name === "Refresh List")) {
                node.addWidget("button", "Refresh List", null, () => refreshAllPortalVisuals(), {});
            }
            // The main refresh in setup will populate it after all nodes are loaded.
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
                if (node && node.comfyClass === "SetNamedPortal" || node.comfyClass === "GetNamedPortal") {
                    setTimeout(refreshAllPortalVisuals, 0);
                }
                return res;
            };
            console.log("[ComfyPortals] onNodeRemoved patched (for Set and Get Portals).");
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
console.log("[ComfyPortals.JS] Script loaded (v24.4 - Floating Button, STRING GetPortal Fix - at end).");