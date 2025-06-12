// ComfyUI/custom_nodes/ComfyPortals/js/ComfyPortals.js
import { app } from "/scripts/app.js";
import { initializePortalManagerUI, portalManagerPanelInstance as panelInstanceFromModule } from "./portal_manager_ui.js";

const EXTENSION_VERSION = "Comfy.ComfyPortals.JS.vNext7_MultiLinkDataFlow";
console.log(`[ComfyPortals.JS] Script loading (${EXTENSION_VERSION}).`);

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
function updateSetPortalSlotsInfo(nodeInstance) {
    if (nodeInstance?.comfyClass !== "SetNamedPortal" || !nodeInstance.inputs) return;

    let hasChanges = false;
    const newActualInputSlotTypes = [];

    nodeInstance.inputs.forEach((inputSlot) => {
        if (inputSlot.name.startsWith("value_")) {
            let determinedType = "*";    // The actual data type of the connection/slot
            let labelDescriptor = "*"; // The text to display in parentheses in the label
            let currentLink = null;

            // --- Automatic Labeling ---
            if (inputSlot.link != null && app.graph.links[inputSlot.link]) {
                currentLink = app.graph.links[inputSlot.link];
                const originNode = app.graph.getNodeById(currentLink.origin_id);

                if (originNode && typeof currentLink.origin_slot !== 'undefined' &&
                    originNode.outputs && originNode.outputs[currentLink.origin_slot]) {

                    const originSlot = originNode.outputs[currentLink.origin_slot];
                    determinedType = originSlot.type || "*";

                    // Prefer source slot's specific name if available and meaningful
                    if (originSlot.name && originSlot.name !== "*" &&
                        !originSlot.name.toLowerCase().startsWith("output_") && // Avoid generic "output_N"
                        originSlot.name.toUpperCase() !== determinedType.toUpperCase()) { // Avoid redundant "MODEL (MODEL)"
                        labelDescriptor = originSlot.name;
                    } else {
                        labelDescriptor = determinedType; // Fallback to data type
                    }

                    if (currentLink.type !== determinedType && determinedType !== "ಪ್ಲೇಸ್холడర్") { // Avoid ComfyUI's internal placeholder type
                        currentLink.type = determinedType;
                    }
                } else if (currentLink && currentLink.type && currentLink.type !== "*" && currentLink.type !== "ಪ್ಲೇಸ್холడర్") {
                    determinedType = currentLink.type; // Fallback to link type
                    labelDescriptor = determinedType;
                } else { // Link exists but type info is incomplete
                    determinedType = "*";
                    labelDescriptor = "*";
                }
            } else { // No link connected
                determinedType = inputSlot.type || "*"; // Should be '*' for unconnected dynamic inputs
                labelDescriptor = (determinedType === "*") ? "*" : determinedType; // Show "*" or the base type
            }
            // --- End Automatic Labeling ---

            // Construct and apply the new label
            const newLabel = `${inputSlot.name} (${labelDescriptor})`;
            if (inputSlot.label !== newLabel) {
                inputSlot.label = newLabel;
                hasChanges = true;
            }

            // Update the slot's actual data type (important for connection coloring and graph logic)
            if (inputSlot.type !== determinedType) {
                inputSlot.type = determinedType;
                hasChanges = true;
            }

            newActualInputSlotTypes.push({
                name: inputSlot.name,         // e.g., "value_1"
                type: determinedType,       // e.g., "MODEL"
                descriptor: labelDescriptor,  // e.g., "MODEL" or "STEPS" or custom manual label if we re-add it
                originalType: "*"           // Base type of the dynamic slot
            });

        } else if (inputSlot.name === "portal_name") {
            newActualInputSlotTypes.push({ name: inputSlot.name, type: "STRING", originalType: "STRING" });
        }
    });

    // Update the node's internal tracking of types (_actualInputSlotTypes)
    const oldActualInputSlotTypes = nodeInstance._actualInputSlotTypes || [];
    if (newActualInputSlotTypes.length !== oldActualInputSlotTypes.length ||
        !newActualInputSlotTypes.every((s, i) => oldActualInputSlotTypes[i] && s.name === oldActualInputSlotTypes[i].name && s.type === oldActualInputSlotTypes[i].type)) {
        nodeInstance._actualInputSlotTypes = newActualInputSlotTypes;
        hasChanges = true;
    }

    if (hasChanges) {
        // Standard refresh calls
        nodeInstance.setDirtyCanvas(true, true);
        if (nodeInstance.graph) {
            if (typeof nodeInstance.graph.onNodeInputsChanged === 'function') {
                nodeInstance.graph.onNodeInputsChanged(nodeInstance);
            }
            if (typeof nodeInstance.computeSize === 'function' && typeof nodeInstance.setSize === 'function') {
                let newSize = nodeInstance.computeSize();
                if (newSize && Array.isArray(newSize.vec2)) newSize = newSize.vec2;
                if (Array.isArray(newSize)) nodeInstance.setSize(newSize);
            }
            if (typeof nodeInstance.graph.setDirtyCanvas === 'function') {
                nodeInstance.graph.setDirtyCanvas(true, true);
            }
        }
    }
}

// --- Portal Name Management ---
let lastKnownPortalNamesForDropdown = [];
const PLACEHOLDER_NO_PORTALS = "_no_portals_found_";
const PLACEHOLDER_REFRESH = "_refresh_or_no_portals_";

// --- Central function to refresh all portal-related UI elements ---
function refreshAllPortalVisuals() {
    if (!app.graph) return;

    const allNodes = app.graph._nodes;
    const NODE_MODE_BYPASSED = LiteGraph.NODE_MODE_BYPASSED || 4;
    const NODE_MODE_NEVER = 2;

    const activeSetters = allNodes.filter(n =>
        n.comfyClass === "SetNamedPortal" &&
        n.mode !== NODE_MODE_BYPASSED &&
        n.mode !== NODE_MODE_NEVER
    );

    const availableSetPortals = new Map();
    activeSetters.forEach(setNode => {
        const name = getPortalNameFromNodeWidget(setNode);
        if (name) {
            let portalDisplayType = "*";
            if (setNode._actualInputSlotTypes && setNode._actualInputSlotTypes.length > 0) {
                const value1Slot = setNode._actualInputSlotTypes.find(s => s.name === "value_1");
                const firstValueSlot = setNode._actualInputSlotTypes.find(s => s.name.startsWith("value_"));
                if (value1Slot) {
                    portalDisplayType = value1Slot.type;
                } else if (firstValueSlot) {
                    portalDisplayType = firstValueSlot.type;
                }
            }
            availableSetPortals.set(name, portalDisplayType);
        }
    });

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

    if (portalPanelInstance) {
        portalPanelInstance.updateList(usedPortalsDataForPanel);
    }

    const allAvailablePortalNamesArray = Array.from(availableSetPortals.keys()).sort();
    let finalDropdownNames = allAvailablePortalNamesArray.length > 0 ? allAvailablePortalNamesArray : [PLACEHOLDER_REFRESH];

    const getNodesForDropdownUpdate = allNodes.filter(n => n.comfyClass === "GetNamedPortal");
    getNodesForDropdownUpdate.forEach(getNode => {
        const widget = getNode.widgets.find(w => w.name === "portal_name");
        if (widget && (widget.type === "combo" || widget.type === "string")) {
            const originalValue = widget.value;
            let optionsChanged = false;
            let valueChanged = false;

            // Update dropdown options if they differ from the fresh list
            if (widget.type === "combo") { // Only combo widgets have 'options'
                if (!widget.options) widget.options = {}; // Ensure options object exists
                if (JSON.stringify(widget.options.values) !== JSON.stringify(finalDropdownNames)) {
                    widget.options.values = [...finalDropdownNames];
                    optionsChanged = true;
                }
            }

            // Update widget's selected value based on new options
            let newSelectedValue = originalValue;
            if (finalDropdownNames.includes(originalValue)) {
                // Current value is still valid, newSelectedValue remains originalValue
                newSelectedValue = originalValue;
            } else if (finalDropdownNames.length > 0) {
                // Current value is not in the new list (or was a placeholder), select the first available
                newSelectedValue = finalDropdownNames[0];
            } else {
                // No portals available, use placeholder
                newSelectedValue = PLACEHOLDER_REFRESH;
            }

            if (widget.value !== newSelectedValue) {
                widget.value = newSelectedValue;
                valueChanged = true;
            }

            // Force redraw of the widget if its options or value have changed.
            // This is a common pattern to ensure LiteGraph updates the widget's visual representation.
            if ((optionsChanged || valueChanged) && getNode.setDirtyCanvas) {
                const tempVal = widget.value;
                widget.value = null; // Momentarily set to null
                widget.value = tempVal; // Set back to the desired value to trigger redraw
            }
        }
    });

    // Update the global cache *after* all nodes have been processed.
    lastKnownPortalNamesForDropdown = [...finalDropdownNames];
}

// --- Helper for GetNamedPortal output synchronization ---
function synchronizeGetPortalOutputs(getNodeInstance) {
    if (!app.graph || getNodeInstance.comfyClass !== "GetNamedPortal") return;

    const portalName = getPortalNameFromNodeWidget(getNodeInstance);
    let targetSetNode = null;

    if (portalName && portalName !== PLACEHOLDER_REFRESH && portalName !== PLACEHOLDER_NO_PORTALS) {
        targetSetNode = app.graph._nodes.find(n =>
            n.comfyClass === "SetNamedPortal" &&
            getPortalNameFromNodeWidget(n) === portalName &&
            n.mode !== (LiteGraph.NODE_MODE_BYPASSED || 4) && n.mode !== 2
        );
    }

    // Determine the desired outputs based on the linked SetNamedPortal
    let desiredOutputs = [];
    if (targetSetNode && targetSetNode._actualInputSlotTypes) {
        targetSetNode._actualInputSlotTypes.forEach((slotInfo) => { // slotInfo is from SetNode's _actualInputSlotTypes
            if (slotInfo.name.startsWith("value_")) { // e.g., slotInfo.name is "value_4", slotInfo.descriptor is "STEPS"
                const valueIndex = slotInfo.name.substring("value_".length); // e.g., "4"
                const outputSlotName = `output_${valueIndex}`;      // e.g., "output_4" (internal name for the GetNode output slot)
                const outputLabelPrefix = `value_${valueIndex}`;  // e.g., "value_4" (prefix for the displayed label)

                // Use the descriptor from SetNamedPortal's slotInfo for the GetNamedPortal's output label
                const descriptorToUse = slotInfo.descriptor || slotInfo.type || "*"; // e.g., "STEPS"
                const labelForGetNode = `${outputLabelPrefix} (${descriptorToUse})`; // e.g., "value_4 (STEPS)"

                desiredOutputs.push({
                    name: outputSlotName,         // Internal name for the slot, e.g., "output_4"
                    type: slotInfo.type || "*",   // Actual data type for connection coloring, e.g., "INT"
                    label: labelForGetNode        // Displayed label, e.g., "value_4 (STEPS)"
                });
            }
        });
    }

    if (desiredOutputs.length === 0) { // Default output if no target or no value_ inputs
        desiredOutputs.push({ name: "output_1", type: "*", label: "value_1 (*)" });
    }

    // Check if the current output structure matches the desired one (including labels)
    let hasStructuralChanges = false;
    const currentOutputsForCompare = getNodeInstance.outputs ? getNodeInstance.outputs.map(o => ({ name: o.name, type: String(o.type), label: o.label })) : [];
    const desiredOutputsForCompare = desiredOutputs.map(d => ({ name: d.name, type: String(d.type), label: d.label }));

    if (JSON.stringify(currentOutputsForCompare) !== JSON.stringify(desiredOutputsForCompare)) {
        hasStructuralChanges = true;

        // Collect ALL old links with precise source information
        const oldLinksData = [];
        if (getNodeInstance.outputs) {
            getNodeInstance.outputs.forEach((outputSlot, outputSlotIndex) => { // outputSlotIndex is 0-based
                if (outputSlot.links && outputSlot.links.length > 0) {
                    outputSlot.links.forEach(linkId => {
                        const link = app.graph.links[linkId];
                        if (link) {
                            oldLinksData.push({
                                // Store by original name and index for robust matching
                                originalOutputName: outputSlot.name,
                                originalOutputSlotIndex: outputSlotIndex, // Numeric index
                                targetNodeId: link.target_id,
                                targetSlotIndex: link.target_slot,
                                linkType: link.type // Preserve the link's type
                            });
                        }
                    });
                }
            });
        }

        // Remove existing outputs from the GetNamedPortal node
        while (getNodeInstance.outputs && getNodeInstance.outputs.length > 0) {
            getNodeInstance.removeOutput(0);
        }

        // Add the new, desired outputs
        desiredOutputs.forEach(slot => {
            getNodeInstance.addOutput(slot.name, slot.type, { label: slot.label });
        });

        // Attempt to re-establish all old links
        if (oldLinksData.length > 0 && getNodeInstance.outputs && getNodeInstance.outputs.length > 0) {
            oldLinksData.forEach(oldLink => {
                // Find the new output slot that corresponds to the oldLink's original output.
                // Matching by name is generally robust if output names are consistent.
                const newOutputSlot = getNodeInstance.outputs.find(o => o.name === oldLink.originalOutputName);

                if (newOutputSlot) {
                    const newOutputSlotIndex = getNodeInstance.outputs.indexOf(newOutputSlot);
                    const targetNode = app.graph.getNodeById(oldLink.targetNodeId);

                    // Ensure the target node and specific input slot still exist
                    if (targetNode && targetNode.inputs[oldLink.targetSlotIndex]) {
                        // Attempt to reconnect. LiteGraph's connect method handles link creation.
                        // It typically won't create a duplicate link if the target input is already full,
                        // but here we are restoring connections that should have been unique.
                        const restoredLinkObject = getNodeInstance.connect(newOutputSlotIndex, targetNode, oldLink.targetSlotIndex);
                        if (restoredLinkObject && app.graph.links[restoredLinkObject.id]) {
                            // Restore the original link type if the connection was successful
                            app.graph.links[restoredLinkObject.id].type = oldLink.linkType;
                        }
                    }
                }
            });
        }
    }

    if (hasStructuralChanges) {
        getNodeInstance.setDirtyCanvas(true, true);
    }
}

// --- Temporary Link Management (for multi-links) ---
function createMultiLinkTemporaryPortalLinks(virtualPortalConnections) {
    const added_temp_link_ids = [];
    const original_links_to_restore_data = [];

    for (const vpc of virtualPortalConnections) {
        const sourceNode = app.graph.getNodeById(vpc.sourceNodeId);
        const destNode = app.graph.getNodeById(vpc.destNodeId);
        if (!sourceNode || !destNode) continue;

        const originalLinkObject = app.graph.links[vpc.originalPersistentLinkId];
        if (originalLinkObject) {
            original_links_to_restore_data.push({
                originalLinkId: vpc.originalPersistentLinkId,
                originNodeId: originalLinkObject.origin_id,
                originSlotName: vpc.getPortalNodeOutputSlotName,
                targetNodeId: originalLinkObject.target_id,
                targetSlotIndex: originalLinkObject.target_slot,
                type: originalLinkObject.type
            });
        }

        const temp_link_obj = sourceNode.connect(vpc.sourceSlotIndex, destNode, vpc.destSlotIndex);
        if (temp_link_obj && typeof temp_link_obj.id !== 'undefined') {
            const tempLinkInGraph = app.graph.links[temp_link_obj.id];
            if (tempLinkInGraph) {
                if (tempLinkInGraph.type !== vpc.linkType) tempLinkInGraph.type = vpc.linkType;
                added_temp_link_ids.push(temp_link_obj.id);
            }
        }
    }
    const restorer = function() {
        for (const id of added_temp_link_ids) {
            if (app.graph.links[id]) app.graph.removeLink(id);
        }
        for (const linkData of original_links_to_restore_data) {
            const originNode = app.graph.getNodeById(linkData.originNodeId);
            const targetNode = app.graph.getNodeById(linkData.targetNodeId);
            if (originNode && targetNode) {
                const originSlotIndex = originNode.outputs?.findIndex(o => o.name === linkData.originSlotName);
                if (typeof originSlotIndex !== 'undefined' && originSlotIndex !== -1) {
                    if (!targetNode.inputs[linkData.targetSlotIndex].link) {
                        const restoredLink = originNode.connect(originSlotIndex, targetNode, linkData.targetSlotIndex);
                        if (restoredLink && app.graph.links[restoredLink.id] && linkData.type) {
                            app.graph.links[restoredLink.id].type = linkData.type;
                        }
                    }
                }
            }
        }
    };
    return { restorer: restorer, added_links: added_temp_link_ids };
}

// --- Main Extension ---
app.registerExtension({
    name: EXTENSION_VERSION,

    async beforeRegisterNodeDef(nodeType, nodeData, appInstance) {
        if (nodeData.name === "Set Named Portal (Input)") {
            const originalOnConnectionsChange = nodeType.prototype.onConnectionsChange;
            nodeType.prototype.onConnectionsChange = function(side, slotIndex, isConnected, linkInfo, ioSlot) {
                originalOnConnectionsChange?.apply(this, arguments);
                if (this.comfyClass === "SetNamedPortal" && side === LiteGraph.INPUT) {
                    if (this.inputs && this.inputs[slotIndex] && this.inputs[slotIndex].name.startsWith("value_")) {
                       const selfNodeInstance  = this;
                        setTimeout(() => {
                            updateSetPortalSlotsInfo(selfNodeInstance ); // This will do the structural "nudge"
                            refreshAllPortalVisuals(); // Refresh other dependent UI
                        }, 0);
                    }
                }
            };
            const originalOnPropertyChanged = nodeType.prototype.onPropertyChanged;
            nodeType.prototype.onPropertyChanged = function(property, value, prev_value) {
                originalOnPropertyChanged?.apply(this, arguments);
                if (this.comfyClass === "SetNamedPortal" && property === "widgets_values") {
                    const portalNameWidget = this.widgets.find(w => w.name === "portal_name");
                    const widgetIndex = this.widgets.indexOf(portalNameWidget);
                    if (portalNameWidget && this.widgets_values[widgetIndex] !== prev_value?.[widgetIndex] ) {
                        setTimeout(refreshAllPortalVisuals, 0);
                    }
                }
            };
        }

        if (nodeData.name === "Get Named Portal (Output)") {
            nodeType.onNodeCloned = function(originalNode, clonedNode) {
                setTimeout(() => {
                    synchronizeGetPortalOutputs(clonedNode);
                    // Re-populate dropdown for the cloned node
                    const widget = clonedNode.widgets.find(w => w.name === "portal_name");
                    if (widget && widget.type === "combo") {
                        const setNodes = app.graph._nodes.filter(n => n.comfyClass === "SetNamedPortal" && n.mode !== (LiteGraph.NODE_MODE_BYPASSED || 4) && n.mode !== 2);
                        const availableNames = new Set();
                        setNodes.forEach(setNode => { const name = getPortalNameFromNodeWidget(setNode); if (name) availableNames.add(name); });
                        const sortedNames = Array.from(availableNames).sort();
                        const finalNames = sortedNames.length > 0 ? sortedNames : [PLACEHOLDER_REFRESH];
                        widget.options.values = [...finalNames];
                        if (!finalNames.includes(widget.value)) widget.value = finalNames[0];
                        const tempVal = widget.value; widget.value = null; widget.value = tempVal; // Force redraw
                    }
                    refreshAllPortalVisuals(); // Global refresh
                }, 150);
            };
        }
    },

    async nodeCreated(node, appInstance) {
        if (node.comfyClass === "SetNamedPortal") {
            node._dynamicInputCounter = node.inputs?.filter(inp => inp.name.startsWith("value_")).length || 0;
            if (node._dynamicInputCounter === 0 && node.inputs?.some(inp => inp.name === "value_1")) node._dynamicInputCounter = 1; // Ensure if value_1 exists from definition
            else if (node._dynamicInputCounter === 0)
            {
                const valueInputs = node.inputs?.filter(inp => inp.name.startsWith("value_")) || [];
                let maxIndex = 0;
                valueInputs.forEach(inp => {
                    const index = parseInt(inp.name.split("_")[1]);
                    if (!isNaN(index) && index > maxIndex) maxIndex = index;
                });
                node._dynamicInputCounter = maxIndex || 0; // If no value_ inputs, 0. If value_1 exists, it'll be 1.
                if (node._dynamicInputCounter === 0 && node.inputs?.some(inp => inp.name === "value_1")) node._dynamicInputCounter = 1;
                else if (node._dynamicInputCounter === 0 && !node.inputs?.find(i => i.name.startsWith("value_"))) node._dynamicInputCounter = 0; // Truly empty initially
            } // Default if no value_ inputs yet from definition

            node._actualInputSlotTypes = node._actualInputSlotTypes || [];

            // "+ Add Input" Button (with update to enable remove button)
            node.addWidget("button", "+ Add Input", null, function() {
                const selfNode = node;
                selfNode._dynamicInputCounter = (selfNode._dynamicInputCounter || 0) + 1;
                const newSlotName = "value_" + selfNode._dynamicInputCounter;
                selfNode.addInput(newSlotName, "*", { label: newSlotName + " (*)" });

                updateSetPortalSlotsInfo(selfNode); // This handles _actualInputSlotTypes and node redraw

                const portalName = getPortalNameFromNodeWidget(selfNode);
                if (portalName && app.graph && app.graph._nodes) {
                    app.graph._nodes.forEach(graphNode => {
                        if (graphNode.comfyClass === "GetNamedPortal" &&
                            getPortalNameFromNodeWidget(graphNode) === portalName) {
                            synchronizeGetPortalOutputs(graphNode);
                        }
                    });
                }

                setTimeout(refreshAllPortalVisuals, 0);

                // Enable the remove button if it's now possible to remove
                const removeWidget = selfNode.widgets.find(w => w.name === "- Remove Input");
                if (removeWidget) {
                    removeWidget.disabled = (selfNode._dynamicInputCounter <= 1);
                }
            });

            // "- Remove Input" Button
            const removeButtonWidget = node.addWidget("button", "- Remove Input", null, function() {
                const selfNode = node; // 'this' refers to widget, so use selfNode for the LGraphNode

                if (selfNode._dynamicInputCounter <= 1) {
                    this.disabled = true;
                    return;
                }

                const slotNameToRemove = "value_" + selfNode._dynamicInputCounter;
                let slotIndexToRemove = -1;
                for (let i = 0; i < selfNode.inputs.length; i++) { // Corrected loop
                    if (selfNode.inputs[i].name === slotNameToRemove) {
                        slotIndexToRemove = i;
                        break;
                    }
                }

                if (slotIndexToRemove !== -1) {
                    selfNode.removeInput(slotIndexToRemove);
                    selfNode._dynamicInputCounter--;

                    updateSetPortalSlotsInfo(selfNode);

                    const portalName = getPortalNameFromNodeWidget(selfNode);
                    if (portalName && app.graph && app.graph._nodes) {
                        app.graph._nodes.forEach(graphNode => {
                            if (graphNode.comfyClass === "GetNamedPortal" &&
                                getPortalNameFromNodeWidget(graphNode) === portalName) {
                                synchronizeGetPortalOutputs(graphNode);
                            }
                        });
                    }

                    if (typeof selfNode.computeSize === 'function' && typeof selfNode.setSize === 'function') {
                        let newComputedSize = selfNode.computeSize();
                        if (newComputedSize && Array.isArray(newComputedSize.vec2)) newComputedSize = newComputedSize.vec2;
                        if (Array.isArray(newComputedSize)) selfNode.setSize(newComputedSize);
                    }
                    selfNode.setDirtyCanvas(true, true);
                    if (selfNode.graph) selfNode.graph.setDirtyCanvas(true, true);

                    setTimeout(refreshAllPortalVisuals, 0);
                    this.disabled = (selfNode._dynamicInputCounter <= 1);
                } else {
                    // ... (resync logic from your script) ...
                    console.warn(`[ComfyPortals] Slot to remove '${slotNameToRemove}' not found. Resyncing counter.`);
                    let maxIndex = 0;
                    selfNode.inputs?.forEach(inp => {
                        if (inp.name.startsWith("value_")) {
                            const index = parseInt(inp.name.split("_")[1]);
                            if (!isNaN(index) && index > maxIndex) maxIndex = index;
                        }
                    });
                    selfNode._dynamicInputCounter = maxIndex;
                    this.disabled = (selfNode._dynamicInputCounter <= 1);
                }
            });
            // Set initial disabled state for the remove button
            if (removeButtonWidget) { // Check if widget was successfully created
                 removeButtonWidget.disabled = (node._dynamicInputCounter <= 1);
            }

            setTimeout(() => updateSetPortalSlotsInfo(node), 50);
            const portalNameWidget = node.widgets.find(w => w.name === "portal_name");
            if (portalNameWidget) {
                const originalWidgetCallback = portalNameWidget.callback;
                portalNameWidget.callback = (value, ...args) => {
                    if (originalWidgetCallback) originalWidgetCallback.call(node, value, ...args);
                    setTimeout(refreshAllPortalVisuals, 0);
                };
            }
        } else if (node.comfyClass === "GetNamedPortal") {
            let portalNameWidgetInstance = node.widgets.find(w => w.name === "portal_name");
            const currentWidgetValue = portalNameWidgetInstance ? portalNameWidgetInstance.value : PLACEHOLDER_REFRESH;
            if (!portalNameWidgetInstance || portalNameWidgetInstance.type !== "combo") {
                const widgetIndex = portalNameWidgetInstance ? node.widgets.indexOf(portalNameWidgetInstance) : -1;
                if (widgetIndex > -1) node.widgets.splice(widgetIndex, 1);
                portalNameWidgetInstance = node.addWidget("combo", "portal_name", currentWidgetValue, () => {
                    synchronizeGetPortalOutputs(node);
                    setTimeout(refreshAllPortalVisuals, 0);
                }, { values: [currentWidgetValue] });
            } else {
                const originalComboCallback = portalNameWidgetInstance.callback;
                portalNameWidgetInstance.callback = (value, LGraphCanvas, N, pos, event) => {
                    if(originalComboCallback) originalComboCallback.call(node, value, LGraphCanvas, N, pos, event);
                    synchronizeGetPortalOutputs(node);
                    setTimeout(refreshAllPortalVisuals, 0);
                };
            }
            if (!node.widgets?.find(w => w.name === "Refresh List")) {
                node.addWidget("button", "Refresh List", null, () => {
                    refreshAllPortalVisuals();
                    synchronizeGetPortalOutputs(node);
                }, {});
            }
            setTimeout(() => {
                refreshAllPortalVisuals();
                synchronizeGetPortalOutputs(node);
            }, 100);
        }
    },

    async loadedGraphNode(node, appInstance) {
        if (node.comfyClass === "SetNamedPortal") {
            let maxIndex = 0;
            if (node.inputs) {
                node.inputs.forEach(inp => {
                    if (inp.name.startsWith("value_")) {
                        const index = parseInt(inp.name.split("_")[1]);
                        if (!isNaN(index) && index > maxIndex) maxIndex = index;
                    }
                });
            }
            // If no value_ inputs but value_1 is defined (e.g. from node definition before any dynamic adds)
            if (maxIndex === 0 && node.inputs?.some(inp => inp.name === "value_1")) {
                maxIndex = 1;
            }
            node._dynamicInputCounter = maxIndex;
            node._actualInputSlotTypes = node._actualInputSlotTypes || [];

            // "+ Add Input" Button (if not present)
            if (!node.widgets?.find(w => w.name === "+ Add Input")) {
                node.addWidget("button", "+ Add Input", null, function() {
                    const selfNode = node;
                    selfNode._dynamicInputCounter = (selfNode._dynamicInputCounter || 0) + 1;
                    const newSlotName = "value_" + selfNode._dynamicInputCounter;
                    selfNode.addInput(newSlotName, "*", { label: newSlotName + " (*)" });
                    updateSetPortalSlotsInfo(selfNode);
                    setTimeout(refreshAllPortalVisuals, 0);
                    const removeWidget = selfNode.widgets.find(w => w.name === "- Remove Input");
                    if (removeWidget) {
                        removeWidget.disabled = (selfNode._dynamicInputCounter <= 1);
                    }
                });
            }

             // "- Remove Input" Button (if not present)
            let removeButtonWidget = node.widgets?.find(w => w.name === "- Remove Input");
            if (!removeButtonWidget) {
                removeButtonWidget = node.addWidget("button", "- Remove Input", null, function() {
                    const selfNode = node;
                    if (selfNode._dynamicInputCounter <= 1) {
                        this.disabled = true; return;
                    }
                    const slotNameToRemove = "value_" + selfNode._dynamicInputCounter;
                    let slotIndexToRemove = -1;
                    for (let i = 0; i < selfNode.inputs.length; i++) {
                        if (selfNode.inputs[i].name === slotNameToRemove) slotIndexToRemove = i; break;
                    }
                    if (slotIndexToRemove !== -1) {
                        selfNode.removeInput(slotIndexToRemove);
                        selfNode._dynamicInputCounter--;
                        updateSetPortalSlotsInfo(selfNode);
                        setTimeout(refreshAllPortalVisuals, 0);
                        this.disabled = (selfNode._dynamicInputCounter <= 1);
                    } else {
                        console.warn(`[ComfyPortals] LoadedNode: Slot to remove '${slotNameToRemove}' not found. Resyncing.`);
                        let currentMaxIndex = 0;
                        selfNode.inputs?.forEach(inp => {
                            if (inp.name.startsWith("value_")) {
                                const indexVal = parseInt(inp.name.split("_")[1]);
                                if (!isNaN(indexVal) && indexVal > currentMaxIndex) currentMaxIndex = indexVal;
                            }
                        });
                        selfNode._dynamicInputCounter = currentMaxIndex;
                        this.disabled = (selfNode._dynamicInputCounter <= 1);
                    }
                });
            }
            // Set initial disabled state for the remove button on loaded nodes
            if (removeButtonWidget) {
                removeButtonWidget.disabled = (node._dynamicInputCounter <= 1);
            }

            setTimeout(() => updateSetPortalSlotsInfo(node), 100);
            const portalNameWidget = node.widgets.find(w => w.name === "portal_name");
            if (portalNameWidget && (!portalNameWidget.callback || !portalNameWidget.callback.toString().includes("refreshAllPortalVisuals"))) {
                const originalWidgetCallback = portalNameWidget.callback;
                portalNameWidget.callback = (value, ...args) => {
                    if (originalWidgetCallback) originalWidgetCallback.call(node, value, ...args);
                    setTimeout(refreshAllPortalVisuals, 0);
                };
            }
        } else if (node.comfyClass === "GetNamedPortal") {
            let portalNameWidgetInstance = node.widgets.find(w => w.name === "portal_name");
            const loadedWidgetValue = portalNameWidgetInstance ? portalNameWidgetInstance.value : PLACEHOLDER_REFRESH;
            if (!portalNameWidgetInstance || portalNameWidgetInstance.type !== "combo") {
                const widgetIndex = portalNameWidgetInstance ? node.widgets.indexOf(portalNameWidgetInstance) : -1;
                if (widgetIndex > -1) node.widgets.splice(widgetIndex, 1);
                portalNameWidgetInstance = node.addWidget("combo", "portal_name", loadedWidgetValue, () => {
                    synchronizeGetPortalOutputs(node);
                    setTimeout(refreshAllPortalVisuals, 0);
                }, { values: [loadedWidgetValue] });
            } else {
                if (!portalNameWidgetInstance.callback || !portalNameWidgetInstance.callback.toString().includes("synchronizeGetPortalOutputs")) {
                    const originalComboCallback = portalNameWidgetInstance.callback;
                    portalNameWidgetInstance.callback = (value, LGraphCanvas, N, pos, event) => {
                        if(originalComboCallback) originalComboCallback.call(node, value, LGraphCanvas, N, pos, event);
                        synchronizeGetPortalOutputs(node);
                        setTimeout(refreshAllPortalVisuals, 0);
                    };
                }
            }
            if (!node.widgets?.find(w => w.name === "Refresh List")) {
                node.addWidget("button", "Refresh List", null, () => {
                    refreshAllPortalVisuals();
                    synchronizeGetPortalOutputs(node);
                }, {});
            }

            setTimeout(() => {synchronizeGetPortalOutputs(node);}, 500);
        }
    },

    async setup(appInstance) {
        console.log(`[ComfyPortals] Setting up with Floating Button (${EXTENSION_VERSION}).`);
        try {
            portalPanelInstance = initializePortalManagerUI();
            if (!portalPanelInstance) { console.error("[ComfyPortals] Failed to initialize PortalManagerPanel instance."); return; }
        } catch (e) { console.error("[ComfyPortals] Error initializing PortalManagerPanel:", e); return; }

        const floatingButton = document.createElement("button");
        floatingButton.id = "comfyportals-floating-toggle-button";
        floatingButton.textContent = "P"; // Changed from "P"
        floatingButton.title = "Toggle Portals List";
        Object.assign(floatingButton.style, {
            position: 'fixed',
            top: '100px', // Initial top position
            right: '300px', // Initial right position
            zIndex: '1005',
            padding: '8px 12px',
            backgroundColor: 'var(--comfy-menu-bg)',
            color: 'var(--fg-color)',
            border: '1px solid var(--border-color)',
            borderRadius: '50%',
            cursor: 'pointer',
            boxShadow: '0px 2px 10px rgba(0,0,0,0.3)',
            fontSize: '14px',
            height: 'auto',
            width: 'auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
        });
        floatingButton.onclick = () => { if (portalPanelInstance) { portalPanelInstance.toggle(); if (portalPanelInstance.element.style.display !== "none") { refreshAllPortalVisuals(); }}};

        let isDraggingButton = false;
        let initialButtonLeft, initialButtonTop; // To store button's position at drag start
        let dragStartX, dragStartY; // To store mouse's position at drag start

        floatingButton.onmousedown = (e) => {
            isDraggingButton = true;
            floatingButton.style.cursor = 'grabbing';
            document.body.style.userSelect = 'none'; // Prevent text selection during drag
            e.preventDefault(); // Prevent default drag behaviors (e.g., image ghosting)

            const rect = floatingButton.getBoundingClientRect();
            initialButtonLeft = rect.left;
            initialButtonTop = rect.top;

            dragStartX = e.clientX;
            dragStartY = e.clientY;

            floatingButton.style.right = ''; // Remove 'right' positioning
            floatingButton.style.left = `${initialButtonLeft}px`;
            floatingButton.style.top = `${initialButtonTop}px`;
        };

        document.onmousemove = (e) => {
            if (!isDraggingButton) return;

            const deltaX = e.clientX - dragStartX;
            const deltaY = e.clientY - dragStartY;

            floatingButton.style.left = `${initialButtonLeft + deltaX}px`;
            floatingButton.style.top = `${initialButtonTop + deltaY}px`;
        };

        document.onmouseup = () => {
            if (isDraggingButton) {
                isDraggingButton = false;
                floatingButton.style.cursor = 'pointer';
                document.body.style.userSelect = ''; // Re-enable text selection
            }
        };

        try { document.body.appendChild(floatingButton); console.log("[ComfyPortals] Floating 'Portal' button added."); }
        catch (e) { console.error("[ComfyPortals] Error appending floating button:", e); }

        try {
            const originalOnNodeRemoved = LGraph.prototype.onNodeRemoved;
            LGraph.prototype.onNodeRemoved = function(node) {
                const res = originalOnNodeRemoved?.apply(this, arguments);
                if (node && (node.comfyClass === "SetNamedPortal" || node.comfyClass === "GetNamedPortal")) {
                    setTimeout(refreshAllPortalVisuals, 0);
                }
                return res;
            };
            console.log("[ComfyPortals] onNodeRemoved patched (for Set and Get Portals).");
        } catch (e) { console.error("[ComfyPortals] Error patching onNodeRemoved:", e); }

        try {
            const originalGraphToPrompt = app.graphToPrompt;
            if (!originalGraphToPrompt) { console.error("[ComfyPortals] original app.graphToPrompt not defined! Cannot patch."); }
            else {
                app.graphToPrompt = async function() {
                    console.log("[ComfyPortals] Patched graphToPrompt: Analyzing multi-links.");
                    const currentGraph = app.graph;
                    if (!currentGraph) { console.error("[ComfyPortals] app.graph not in graphToPrompt. Calling original."); return await originalGraphToPrompt.apply(app, arguments); }

                    const NODE_MODE_BYPASSED = LiteGraph.NODE_MODE_BYPASSED || 4;
                    const NODE_MODE_NEVER = 2;
                    const liveGetters = currentGraph._nodes.filter(n => n.comfyClass === "GetNamedPortal" && n.mode !== NODE_MODE_BYPASSED && n.mode !== NODE_MODE_NEVER);
                    const liveSetters = currentGraph._nodes.filter(n => n.comfyClass === "SetNamedPortal" && n.mode !== NODE_MODE_BYPASSED && n.mode !== NODE_MODE_NEVER);
                    let allVirtualPortalConnections = [];

                    for (const getNode of liveGetters) {
                        const portalName = getPortalNameFromNodeWidget(getNode);
                        if (!portalName || portalName === PLACEHOLDER_NO_PORTALS || portalName === PLACEHOLDER_REFRESH) continue;
                        const setNode = liveSetters.find(s => getPortalNameFromNodeWidget(s) === portalName);
                        if (!setNode) { console.warn(`[ComfyPortals] No active SetNamedPortal for '${portalName}' (GetNode ${getNode.id})`); continue; }
                        if (!setNode._actualInputSlotTypes || setNode._actualInputSlotTypes.length === 0) { console.warn(`[ComfyPortals] SetNamedPortal ${setNode.id} ('${portalName}') has no _actualInputSlotTypes.`); continue; }

                        for (const setInputSlotInfo of setNode._actualInputSlotTypes) {
                            if (!setInputSlotInfo.name.startsWith("value_")) continue;
                            const setPortalInputName = setInputSlotInfo.name;
                            const actualDataType = setInputSlotInfo.type;
                            const setNodeInputSlot = setNode.inputs?.find(i => i.name === setPortalInputName);
                            if (!setNodeInputSlot || setNodeInputSlot.link == null) { console.log(`[ComfyPortals] Input '${setPortalInputName}' on SetNode '${setNode.id}' unconnected.`); continue; }
                            let sourceLink = currentGraph.links[setNodeInputSlot.link];
                            if (!sourceLink) continue;
                            if (currentGraph.handle_bypass) sourceLink = currentGraph.handle_bypass(sourceLink) || sourceLink;
                            if (!sourceLink) continue;
                            const trueSourceNode = currentGraph.getNodeById(sourceLink.origin_id);
                            const trueSourceSlotIndex = sourceLink.origin_slot;
                            if (!trueSourceNode || typeof trueSourceSlotIndex === 'undefined') { console.warn(`[ComfyPortals] No true source for ${setNode.id}.${setPortalInputName}`); continue; }
                            const inputIndex = setPortalInputName.split("_")[1];
                            const getPortalOutputName = `output_${inputIndex}`;
                            const getNodeOutputSlot = getNode.outputs?.find(o => o.name === getPortalOutputName);
                            if (!getNodeOutputSlot) { console.warn(`[ComfyPortals] GetNode ${getNode.id} missing output '${getPortalOutputName}'.`); continue; }
                            if (getNodeOutputSlot.links && getNodeOutputSlot.links.length > 0) {
                                for (const outLinkIdx of getNodeOutputSlot.links) {
                                    const persistentLink = currentGraph.links[outLinkIdx];
                                    if (!persistentLink) continue;
                                    const trueDestNode = currentGraph.getNodeById(persistentLink.target_id);
                                    const trueDestSlotIndex = persistentLink.target_slot;
                                    if (trueDestNode && typeof trueDestSlotIndex !== 'undefined' && trueDestNode.mode !== NODE_MODE_BYPASSED && trueDestNode.mode !== NODE_MODE_NEVER) {
                                        allVirtualPortalConnections.push({
                                            sourceNodeId: trueSourceNode.id, sourceSlotIndex: trueSourceSlotIndex,
                                            destNodeId: trueDestNode.id, destSlotIndex: trueDestSlotIndex,
                                            linkType: actualDataType, getPortalNodeId: getNode.id,
                                            getPortalNodeOutputSlotName: getPortalOutputName, originalPersistentLinkId: persistentLink.id
                                        });
                                    }
                                }
                            }
                        }
                    }
                    // console.log("[ComfyPortals] VPCs for multi-link:", allVirtualPortalConnections);
                    const linkMods = createMultiLinkTemporaryPortalLinks(allVirtualPortalConnections);
                    let promptResult;
                    try { promptResult = await originalGraphToPrompt.apply(app, arguments); }
                    finally { linkMods.restorer(); if(app.graph) app.graph.setDirtyCanvas(true,true); }
                    return promptResult;
                };
                console.log("[ComfyPortals] app.graphToPrompt patched for multi-link portals.");
            }
        } catch (e) { console.error("[ComfyPortals] Error patching app.graphToPrompt:", e); }

        try {
            setTimeout(() => {
                if (app.graph) { refreshAllPortalVisuals(); }
                else { console.warn("[ComfyPortals] app.graph not ready for initial refresh."); }
            }, 1000);
        } catch (e) { console.error("[ComfyPortals] Error in initial refreshAllPortalVisuals timeout:", e); }
        console.log(`[ComfyPortals] Floating button setup complete (${EXTENSION_VERSION}).`);
    }
});
console.log(`[ComfyPortals.JS] Script loaded (${EXTENSION_VERSION} - at end).`);