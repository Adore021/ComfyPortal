// ComfyUI/custom_nodes/ComfyPortals/js/ComfyPortals.js (v21)
import { app } from "/scripts/app.js";

console.log("[ComfyPortals.JS] Script loading (v21 - Adapting UE Core Linking).");

// --- Utility: Get Portal Name ---
function getPortalNameFromNode(nodeInstance) {
    if (nodeInstance?.widgets) {
        const widget = nodeInstance.widgets.find(w => w.name === "portal_name");
        if (widget?.value && String(widget.value).trim() !== "" && !String(widget.value).startsWith("_")) {
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
    let linkToSetPortal = null;

    if (inputSlot.link != null && app.graph.links[inputSlot.link]) {
        linkToSetPortal = app.graph.links[inputSlot.link];
        const originNode = app.graph.getNodeById(linkToSetPortal.origin_id);
        if (originNode?.outputs?.[linkToSetPortal.origin_slot]) {
            determinedType = originNode.outputs[linkToSetPortal.origin_slot].type || "*";
            // Ensure the link object itself has the correct type (like UE does)
            if (linkToSetPortal.type !== determinedType) {
                linkToSetPortal.type = determinedType;
                console.log(`[ComfyPortals] Link ${linkToSetPortal.id} (to SetPortal ${nodeInstance.id}) type updated to '${determinedType}'.`);
            }
        }
    }
    nodeInstance._actualDataType = determinedType; // Store on the SetPortal instance
    inputSlot.label = `value (${determinedType})`;
    console.log(`[ComfyPortals] SetNamedPortal ${nodeInstance.id} ('${getPortalNameFromNode(nodeInstance)}') _actualDataType = '${determinedType}'.`);
    nodeInstance.setDirtyCanvas(true, true);
}

// --- Temporary Link Management ---
let portalActionsForCleanup = []; // To store { tempLinkId: id, originalLinkToRestore: linkObject }

// Adapted from UE's convert_to_links
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

        // Store original link if destination slot is already connected
        const destInputSlot = destNode.inputs[vpc.destSlotIndex];
        if (destInputSlot && destInputSlot.link != null) {
            const originalLink = app.graph.links[destInputSlot.link];
            if (originalLink) {
                // Ensure it's the link from our GetNamedPortal that we want to restore
                if (originalLink.origin_id === vpc.getPortalNodeId && originalLink.origin_slot === vpc.getPortalNodeOutputSlotIndex) {
                    original_links_to_restore.push(JSON.parse(JSON.stringify(originalLink)));
                    console.log(`[ComfyPortals] Storing original link ${originalLink.id} from GetPortal ${vpc.getPortalNodeId} to ${destNode.id}[${vpc.destSlotIndex}] for restoration.`);
                }
            }
        }

        console.log(`[ComfyPortals] Connecting Temp: ${sourceNode.id}[${vpc.sourceSlotIndex}] (type: ${vpc.linkType}) -> ${destNode.id}[${vpc.destSlotIndex}]`);
        const temp_link_obj = sourceNode.connect(vpc.sourceSlotIndex, destNode, vpc.destSlotIndex);

        if (temp_link_obj && typeof temp_link_obj.id !== 'undefined') {
            // UE relies on sourceNode.outputs[slot].type. We ensure the link obj has it.
            // The type should be correct from sourceNode.connect based on sourceSlot.type
            if (app.graph.links[temp_link_obj.id] && app.graph.links[temp_link_obj.id].type !== vpc.linkType) {
                 console.warn(`[ComfyPortals] Temporary link ${temp_link_obj.id} created with type '${app.graph.links[temp_link_obj.id].type}', but expected '${vpc.linkType}'. Forcing type.`);
                 app.graph.links[temp_link_obj.id].type = vpc.linkType;
            }
            added_temp_link_ids.push(temp_link_obj.id);
            console.log(`[ComfyPortals] Temp link ${temp_link_obj.id} (type: ${app.graph.links[temp_link_obj.id]?.type}) created.`);
        } else {
            console.error("[ComfyPortals] Failed to create temp_link_obj or it has no id.", temp_link_obj);
        }
    }

    const restorer = function() {
        console.log("[ComfyPortals] Restorer: Removing temp links:", added_temp_link_ids);
        for (const id of added_temp_link_ids) {
            if (app.graph.links[id]) app.graph.removeLink(id);
        }
        console.log("[ComfyPortals] Restorer: Restoring original links:", original_links_to_restore.map(l=>l.id));
        for (const linkData of original_links_to_restore) {
            const oNode = app.graph.getNodeById(linkData.origin_id); // Should be GetNamedPortal
            const tNode = app.graph.getNodeById(linkData.target_id);
            if (oNode && tNode) {
                // Check if target slot is free before reconnecting
                if (!tNode.inputs[linkData.target_slot].link) {
                    console.log(`[ComfyPortals] Restoring: ${oNode.id}[${linkData.origin_slot}] -> ${tNode.id}[${linkData.target_slot}]`);
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
    name: "Comfy.ComfyPortals.JS.v21",
    async beforeRegisterNodeDef(nodeType, nodeData) {
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
    async nodeCreated(node) {
        if (node.comfyClass === "SetNamedPortal") {
            setTimeout(() => updateSetPortalInfo(node), 50); // Initial update
            // ... (onPropertyChanged for portal_name for scanAndListAvailablePortals - from previous versions)
        }
        if (node.comfyClass === "GetNamedPortal") {
            // ... (addWidget for "Scan Portals" button - from previous versions) ...
        }
    },
    async setup() {
        const originalGraphToPrompt = app.graphToPrompt;
        app.graphToPrompt = async function() {
            console.log("[ComfyPortals v21] Patched app.graphToPrompt: Analyzing portal links.");

            const currentGraph = app.graph;
            const NODE_MODE_BYPASSED = LiteGraph.NODE_MODE_BYPASSED || 4;
            const NODE_MODE_NEVER = LiteGraph.NODE_MODE_NEVER || 2;

            const liveGetters = currentGraph._nodes.filter(n => n.comfyClass === "GetNamedPortal" && n.mode !== NODE_MODE_BYPASSED && n.mode !== NODE_MODE_NEVER);
            const liveSetters = currentGraph._nodes.filter(n => n.comfyClass === "SetNamedPortal" && n.mode !== NODE_MODE_BYPASSED && n.mode !== NODE_MODE_NEVER);

            const virtualPortalConnections = [];

            for (const getNode of liveGetters) {
                const portalName = getPortalNameFromNode(getNode);
                if (!portalName) continue;
                const setNode = liveSetters.find(s => getPortalNameFromNode(s) === portalName);
                if (!setNode) {
                    console.warn(`[ComfyPortals] No active SetNamedPortal found for '${portalName}' (GetNode ${getNode.id})`);
                    continue;
                }

                // True Source (feeding into SetNamedPortal)
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

                // True Destinations (fed by GetNamedPortal)
                const getNodeValueOutput = getNode.outputs?.find(o => o.name === "value");
                if (!getNodeValueOutput?.links?.length) continue;

                for (const outLinkIdx of getNodeValueOutput.links) {
                    const persistentLink = currentGraph.links[outLinkIdx]; // GetPortal -> DestNode
                    if (!persistentLink) continue;
                    const trueDestNode = currentGraph.getNodeById(persistentLink.target_id);
                    const trueDestSlotIndex = persistentLink.target_slot;

                    if (trueDestNode && typeof trueDestSlotIndex !== 'undefined' && trueDestNode.mode !== NODE_MODE_BYPASSED && trueDestNode.mode !== NODE_MODE_NEVER) {
                        virtualPortalConnections.push({
                            sourceNodeId: trueSourceNode.id,
                            sourceSlotIndex: trueSourceSlotIndex,
                            destNodeId: trueDestNode.id,
                            destSlotIndex: trueDestSlotIndex,
                            linkType: actualDataType, // This is the crucial type
                            getPortalNodeId: getNode.id, // Needed for link restoration reference
                            getPortalNodeOutputSlotIndex: getNode.outputs.indexOf(getNodeValueOutput)
                        });
                    }
                }
            }

            console.log("[ComfyPortals] Virtual Portal Connections determined:", virtualPortalConnections);
            const linkMods = createTemporaryPortalLinks(virtualPortalConnections);

            let promptResult;
            try {
                promptResult = await originalGraphToPrompt.apply(app, arguments);
            } finally {
                console.log("[ComfyPortals] Restoring graph after prompt.");
                linkMods.restorer();
                if(app.graph) app.graph.setDirtyCanvas(true,true);
            }
            return promptResult;
        };
        console.log("[ComfyPortals.JS] app.graphToPrompt patched (v21).");
        // Visual link drawing setup can be added later by patching LGraphCanvas.drawConnections
    }
});
console.log("[ComfyPortals.JS] Script loaded (v21).");