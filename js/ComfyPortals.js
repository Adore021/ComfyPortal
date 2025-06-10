// ComfyUI/custom_nodes/ComfyPortals/js/ComfyPortals.js (v23 - True Auto-Refresh & Button)
import { app } from "/scripts/app.js";

console.log("[ComfyPortals.JS] Script loading (v23 - True Auto-Refresh, Refresh Button).");

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

// --- Portal Name Management for Dropdowns ---
let lastKnownPortalNames = [];
const PLACEHOLDER_NO_PORTALS = "_no_portals_found_";
const PLACEHOLDER_REFRESH = "_refresh_or_no_portals_"; // From Python

function scanAndRefreshGetPortalDropdowns() {
    if (!app.graph) return;
    // console.log("[ComfyPortals] ScanAndRefresh: Starting scan...");

    const setNodes = app.graph._nodes.filter(n =>
        n.comfyClass === "SetNamedPortal" &&
        n.mode !== LiteGraph.NODE_MODE_BYPASSED && // Bypassed mode
        n.mode !== 2 // Muted/Never mode (LiteGraph.NODE_MODE_NEVER)
    );
    const portalNames = new Set();

    setNodes.forEach(setNode => {
        const name = getPortalNameFromNodeWidget(setNode);
        if (name) portalNames.add(name);
    });

    const sortedPortalNames = Array.from(portalNames).sort();
    let finalNames = sortedPortalNames.length > 0 ? sortedPortalNames : [PLACEHOLDER_NO_PORTALS];

    if (JSON.stringify(lastKnownPortalNames) === JSON.stringify(finalNames)) {
        // console.log("[ComfyPortals] ScanAndRefresh: Portal name list unchanged.");
        return; // No actual change in names, no need to update widgets
    }
    lastKnownPortalNames = finalNames;
    console.log("[ComfyPortals] ScanAndRefresh: Refreshing GetPortal dropdowns with names:", finalNames);

    const getNodes = app.graph._nodes.filter(n => n.comfyClass === "GetNamedPortal");
    getNodes.forEach(getNode => {
        const widget = getNode.widgets.find(w => w.name === "portal_name");
        if (widget && widget.type === "combo") {
            const currentValue = widget.value;
            widget.options.values = [...finalNames]; // Crucial: update the source of options

            if (finalNames.includes(currentValue)) {
                widget.value = currentValue; // Preserve selection if still valid
            } else if (finalNames.length > 0) {
                widget.value = finalNames[0]; // Select first available, or placeholder
            } else { // Should be covered by finalNames[0] if placeholder is the only item
                widget.value = PLACEHOLDER_NO_PORTALS;
            }
            // Force the node to redraw its widgets.
            // This is often necessary for LiteGraph to pick up changes to widget.options
            getNode.setDirtyCanvas(true, false);
        }
    });
}

// --- Temporary Link Management (no changes from previous version) ---
function createTemporaryPortalLinks(virtualPortalConnections) {
    const added_temp_link_ids = [];
    const original_links_to_restore = [];

    for (const vpc of virtualPortalConnections) {
        const sourceNode = app.graph.getNodeById(vpc.sourceNodeId);
        const destNode = app.graph.getNodeById(vpc.destNodeId);

        if (!sourceNode || !destNode) {
            console.error("[ComfyPortals] Missing source or destination node for VPC:", vpc);
            continue;
        }

        const destInputSlot = destNode.inputs[vpc.destSlotIndex];
        if (destInputSlot && destInputSlot.link != null) {
            const originalLink = app.graph.links[destInputSlot.link];
            if (originalLink) {
                if (originalLink.origin_id === vpc.getPortalNodeId && originalLink.origin_slot === vpc.getPortalNodeOutputSlotIndex) {
                    original_links_to_restore.push(JSON.parse(JSON.stringify(originalLink)));
                }
            }
        }

        const temp_link_obj = sourceNode.connect(vpc.sourceSlotIndex, destNode, vpc.destSlotIndex);

        if (temp_link_obj && typeof temp_link_obj.id !== 'undefined') {
            if (app.graph.links[temp_link_obj.id] && app.graph.links[temp_link_obj.id].type !== vpc.linkType) {
                 app.graph.links[temp_link_obj.id].type = vpc.linkType;
            }
            added_temp_link_ids.push(temp_link_obj.id);
        } else {
            console.error("[ComfyPortals] Failed to create temp_link_obj or it has no id.", temp_link_obj);
        }
    }

    const restorer = function() {
        for (const id of added_temp_link_ids) {
            if (app.graph.links[id]) app.graph.removeLink(id);
        }
        for (const linkData of original_links_to_restore) {
            const oNode = app.graph.getNodeById(linkData.origin_id);
            const tNode = app.graph.getNodeById(linkData.target_id);
            if (oNode && tNode) {
                if (!tNode.inputs[linkData.target_slot].link) {
                    oNode.connect(linkData.origin_slot, tNode, linkData.target_slot);
                } else {
                     console.warn(`[ComfyPortals] Restorer: Target slot ${tNode.id}[${linkData.target_slot}] already occupied. Original link ${linkData.id} not restored.`);
                }
            }
        }
    };
    return { restorer: restorer, added_links: added_temp_link_ids };
}


// --- Main Extension ---
app.registerExtension({
    name: "Comfy.ComfyPortals.JS.v23",
    async beforeRegisterNodeDef(nodeType, nodeData, appInstance) {
        if (nodeData.name === "Set Named Portal (Input)") {
            const originalOnConnectionsChange = nodeType.prototype.onConnectionsChange;
            nodeType.prototype.onConnectionsChange = function(side, slotIndex, isConnected, linkInfo, ioSlot) {
                originalOnConnectionsChange?.apply(this, arguments);
                if (this.comfyClass === "SetNamedPortal" && side === LiteGraph.INPUT && this.inputs[slotIndex]?.name === "value") {
                    updateSetPortalInfo(this);
                }
            };
        }
    },
    async nodeCreated(node, appInstance) {
        if (node.comfyClass === "SetNamedPortal") {
            setTimeout(() => updateSetPortalInfo(node), 50); // Initial type info update

            // Attach a callback to the 'portal_name' widget for live updates
            const portalNameWidget = node.widgets.find(w => w.name === "portal_name");
            if (portalNameWidget) {
                const originalWidgetCallback = portalNameWidget.callback;
                portalNameWidget.callback = (value, LGraphCanvas, N, pos, event) => {
                    if (originalWidgetCallback) { // Call previous callback if exists
                        originalWidgetCallback.call(node, value, LGraphCanvas, N, pos, event);
                    }
                    // console.log(`[ComfyPortals] SetNamedPortal '${node.id}' portal_name changed to '${value}'. Triggering refresh.`);
                    setTimeout(scanAndRefreshGetPortalDropdowns, 0); // Use setTimeout to ensure value is committed
                    return; // Check LiteGraph docs if widget callback expects a return value
                };
            }
            // When a new SetPortal is created, refresh the lists
            setTimeout(scanAndRefreshGetPortalDropdowns, 0);

        } else if (node.comfyClass === "GetNamedPortal") {
            // Add "Refresh List" button if it doesn't exist
            if (!node.widgets?.find(w => w.name === "Refresh List")) {
                node.addWidget(
                    "button",       // type
                    "Refresh List", // name (for the button itself)
                    null,           // value (not used for button text usually)
                    () => {         // callback
                        // console.log("[ComfyPortals] Manual refresh triggered.");
                        scanAndRefreshGetPortalDropdowns();
                    },
                    {}              // options
                );
            }
            // Populate its dropdown on creation
            setTimeout(scanAndRefreshGetPortalDropdowns, 50);
        }
    },
    async loadedGraphNode(node, appInstance) { // Called for each node when a graph is loaded
        if (node.comfyClass === "SetNamedPortal") {
            setTimeout(() => updateSetPortalInfo(node), 100); // Update type info

            // Re-attach widget callback for portal_name if it was lost during serialization
            const portalNameWidget = node.widgets.find(w => w.name === "portal_name");
            if (portalNameWidget && (!portalNameWidget.callback || !portalNameWidget.callback.toString().includes("scanAndRefreshGetPortalDropdowns"))) {
                const originalWidgetCallback = portalNameWidget.callback;
                portalNameWidget.callback = (value, LGraphCanvas, N, pos, event) => {
                    if (originalWidgetCallback) {
                        originalWidgetCallback.call(node, value, LGraphCanvas, N, pos, event);
                    }
                    setTimeout(scanAndRefreshGetPortalDropdowns, 0);
                    return;
                };
            }
        } else if (node.comfyClass === "GetNamedPortal") {
            // Ensure "Refresh List" button exists on loaded nodes
            if (!node.widgets?.find(w => w.name === "Refresh List")) {
                node.addWidget("button", "Refresh List", null, () => scanAndRefreshGetPortalDropdowns(), {});
                node.setDirtyCanvas(true, false); // Redraw if button was added
            }
        }
        // The global scan in `setup` will handle the initial population after all nodes are loaded.
    },
    async setup(appInstance) {
        // Initial scan when the graph is fully loaded (after all loadedGraphNode calls)
        setTimeout(scanAndRefreshGetPortalDropdowns, 250); // Slightly longer delay

        // Patch LGraph to detect SetNamedPortal removals
        const originalOnNodeRemoved = LGraph.prototype.onNodeRemoved;
        LGraph.prototype.onNodeRemoved = function(node) {
            const res = originalOnNodeRemoved?.apply(this, arguments); // Call original first
            if (node.comfyClass === "SetNamedPortal") {
                // console.log(`[ComfyPortals] SetNamedPortal '${node.id}' removed. Triggering refresh.`);
                setTimeout(scanAndRefreshGetPortalDropdowns, 0);
            }
            return res;
        };

        const originalGraphToPrompt = app.graphToPrompt;
        app.graphToPrompt = async function() {
            // ... (graphToPrompt logic remains the same as v22) ...
            const currentGraph = app.graph;
            const NODE_MODE_BYPASSED = LiteGraph.NODE_MODE_BYPASSED || 4;
            const NODE_MODE_NEVER = 2; // LiteGraph.NODE_MODE_NEVER

            const liveGetters = currentGraph._nodes.filter(n => n.comfyClass === "GetNamedPortal" && n.mode !== NODE_MODE_BYPASSED && n.mode !== NODE_MODE_NEVER);
            const liveSetters = currentGraph._nodes.filter(n => n.comfyClass === "SetNamedPortal" && n.mode !== NODE_MODE_BYPASSED && n.mode !== NODE_MODE_NEVER);

            const virtualPortalConnections = [];

            for (const getNode of liveGetters) {
                const portalName = getPortalNameFromNodeWidget(getNode);
                if (!portalName || portalName === PLACEHOLDER_NO_PORTALS || portalName === PLACEHOLDER_REFRESH) {
                    console.warn(`[ComfyPortals] GetNamedPortal ${getNode.id} has no valid portal selected ('${portalName}'). Skipping.`);
                    continue;
                }
                const setNode = liveSetters.find(s => getPortalNameFromNodeWidget(s) === portalName);
                if (!setNode) {
                    console.warn(`[ComfyPortals] No active SetNamedPortal found for '${portalName}' (GetNode ${getNode.id})`);
                    continue;
                }

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
                            sourceNodeId: trueSourceNode.id,
                            sourceSlotIndex: trueSourceSlotIndex,
                            destNodeId: trueDestNode.id,
                            destSlotIndex: trueDestSlotIndex,
                            linkType: actualDataType,
                            getPortalNodeId: getNode.id,
                            getPortalNodeOutputSlotIndex: getNode.outputs.indexOf(getNodeValueOutput)
                        });
                    }
                }
            }

            const linkMods = createTemporaryPortalLinks(virtualPortalConnections);
            let promptResult;
            try {
                promptResult = await originalGraphToPrompt.apply(app, arguments);
            } finally {
                linkMods.restorer();
                if(app.graph) app.graph.setDirtyCanvas(true,true);
            }
            return promptResult;
        };
        // console.log("[ComfyPortals.JS] app.graphToPrompt patched (v23).");
    }
});
console.log("[ComfyPortals.JS] Script loaded (v23).");