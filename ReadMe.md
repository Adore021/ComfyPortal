# ComfyPortal for ComfyUI

**Clean up your ComfyUI workflows with explicit, named 'portals' for your data!**

ComfyPortal provides a way to send data (Models, CLIPs, VAEs, Latents, Images, Conditioning, etc.) across your ComfyUI graph without drawing long, messy noodles. It uses a "virtual wiring" mechanism inspired by robust nodes like `cg-use-everywhere`, meaning data flows directly during execution without being stored in a global Python variable by the portal nodes themselves.

This system offers a more explicit, variable-like approach: you create a named portal with a `Set Named Portal` node and then retrieve the data using a `Get Named Portal` node by selecting the same name, giving you fine-grained control over your data pathways.

## Features

*   **Explicit Portal Naming:** Clearly define portal names for sending and receiving data.
*   **No Python Global Data Storage:** Portal nodes are lightweight Python placeholders. Data flows via temporary, direct links created by JavaScript during prompt execution, ensuring efficiency.
*   **Type-Aware Sender:** The `Set Named Portal` node's input UI updates to show the type of data connected to it (e.g., "value (CLIP)").
*   **Dynamic Portal List:** The `Get Named Portal` node features a "Scan Available Portals" button that populates its list with currently defined portal names from your graph.
*   **Preserves Graph Clarity:** Keeps your main workflow connections tidy.
*   **(Experimental) Visual Path Display:** The `Get Named Portal` node will include a "Show/Hide Path" button to visually trace the data flow from the true data source to the true data destination on the canvas. *(This feature is in active development and refinement).*
*   **UI for managing/listing all defined portals in the workflow.
* 
## How It Works (Conceptual)

1.  **`Set Named Portal (Input)` Node:**
    *   You connect a data source (e.g., the CLIP output of a `Load Checkpoint` node) to its `value` input.
    *   You assign a unique `portal_name` (e.g., "MyMainClip") via its text widget.
    *   JavaScript on this node detects the type of the incoming data (e.g., "CLIP") and updates the `value` input's label for clarity. This detected type is stored on the node's JS instance.

2.  **`Get Named Portal (Output)` Node:**
    *   You type the desired `portal_name` into its text widget.
    *   The "Scan Available Portals" button helps by logging all portal names currently defined by `Set Named Portal` nodes in your graph to the browser console (and in future versions, will populate a dropdown).

3.  **Execution (`Queue Prompt`):**
    *   The Python functions for these nodes (`nop_function`) do nothing with the data itself.
    *   **JavaScript Magic:** A patch to ComfyUI's `app.graphToPrompt` function is the core:
        *   It finds all active `SetNamedPortal` -> `GetNamedPortal` pairs with matching `portal_name`s.
        *   For each pair, it identifies the **true source node/slot** (e.g., `Load Checkpoint`'s CLIP output slot) that feeds the `SetNamedPortal`.
        *   It identifies the **true destination node/slot** (e.g., `CLIPTextEncode`'s CLIP input slot) that the `GetNamedPortal`'s output is connected to.
        *   It **temporarily creates a direct, real LiteGraph link** from the true source to the true destination. The `type` of this link is explicitly set based on the data type captured by the `SetNamedPortal` node (e.g., "CLIP").
        *   Any original link from `GetNamedPortal` to the destination is stored.
        *   ComfyUI's backend then executes the graph using these temporary direct connections, allowing data to flow.
        *   After execution, the temporary links are removed, and the original links (e.g., `GetNamedPortal` -> destination) are restored, preserving your visual graph layout.

4.  **Visual Path (Toggleable):**
    *   The "Show/Hide Path" button on `GetNamedPortal` (when fully implemented and working robustly) will trigger JavaScript to draw (or erase) a visual line on the canvas. This line will go from the output slot of the *true source node* to the input slot of the *true destination node*, providing a clear visual guide for that portal's data flow. This is a separate visual layer and does not affect execution.

## Installation

1.  **Clone or Download:**
    *   Clone this repository into your `ComfyUI/custom_nodes/` directory:
        ```bash
        cd ComfyUI/custom_nodes/
        git clone https://github.com/Adore021/ComfyPortal.git 
        ```
    *   Alternatively, download the ZIP of this repository, extract it, and place the `ComfyPortals` folder (which contains `__init__.py` and the `js` subfolder) into your `ComfyUI/custom_nodes/` directory.

2.  **Directory Structure:** Ensure the structure is:
    ```
    ComfyUI/
    └── custom_nodes/
        └── ComfyPortals/
            ├── __init__.py
            └── js/
                └── ComfyPortals.js 
    ```

3.  **Restart ComfyUI:** Completely stop and restart your ComfyUI application.

The nodes "Set Named Portal (Input)" and "Get Named Portal (Output)" should now be available under the "Utils/Portals" category when you add nodes.

## Usage Guide

1.  **Add a `Set Named Portal (Input)` node.**
2.  **Connect Data Source:** Connect the output of a node (e.g., `Load Checkpoint` -> `CLIP` output) to the `value` input of the `Set NamedPortal` node.
    *   Observe the `value` input label on the `SetNamedPortal` node; it should update to show the detected data type (e.g., "value (CLIP)").
3.  **Name the Portal:** In the `portal_name` widget of the `Set NamedPortal` node, type a unique and descriptive name for this data channel (e.g., "MainCLIP", "MyLatentSource").
4.  **Add a `Get Named Portal (Output)` node** elsewhere in your workflow where you need this data.
5.  **Select/Type Portal Name:**
    *   Click the "(Not Included in current version)Scan Available Portals" button on the `GetNamedPortal` node. Check your browser's developer console (F12 -> Console) for a list of currently defined portal names from your `SetNamedPortal` nodes.
    *   Type the exact same `portal_name` (e.g., "MainCLIP") into the `portal_name` widget on the `GetNamedPortal` node.
6.  **Connect Data Destination:** Connect the `value` output of the `GetNamedPortal` node to the desired input slot of another node (e.g., `CLIPTextEncode` -> `clip` input).
7.  **(Optional) Visualize Path:** Click the "Show Path" button on the `GetNamedPortal` node to see a visual representation of the data flow (from true source to true destination). Click again to hide.
8.  **Queue Prompt:** The data will now flow from your original source, through the named portal, to its destination when the workflow executes. Your original connections made with the `GetNamedPortal` node will be preserved after execution.

**Example:**
*   `Load Checkpoint` -> `CLIP` output  ->  `SetNamedPortal.value` (portal_name: "SharedCLIP")
*   ... other parts of your graph ...
*   `GetNamedPortal.value` (portal_name: "SharedCLIP")  ->  `CLIPTextEncode.clip`
![Example.png](https://github.com/Adore021/ComfyPortal/blob/main/Example.png)

## Troubleshooting

*   **CLIP Input Error (`CLIPTextEncode` receives `None`):**
    *   Ensure you are using the latest version of `ComfyPortals.js`.
    *   Open your browser's Developer Console (F12 -> Console).
    *   When you connect the CLIP output from `Load Checkpoint` to `SetNamedPortal.value`, check the console for logs confirming that `_actualDataType` was set to "CLIP" and the input label updated.
    *   When you queue the prompt, check the browser console logs from the `app.graphToPrompt` patch. Specifically, look for the logs related to the CLIP portal:
        *   `Using Authoritative Type for Link: 'CLIP'`
        *   `Temp link ID ... type FORCED to 'CLIP'.`
    *   If these types are not "CLIP", there's an issue in the JS type detection or forcing.
*   **"(Not Included in current version)Scan Available Portals" button doesn't update a dropdown / Portal name not found:**
    *   Currently, the `portal_name` on `GetNamedPortal` is a text input. The "Scan" button logs available names to the browser console to help you know what to type. Future versions may implement a dynamic dropdown UI.
*   **(Not Included in current version)Visual Path not appearing/updating correctly:**
    *   This feature is experimental. Check the browser console for any JavaScript errors related to SVG drawing or canvas manipulation.
    *   Ensure your browser cache is cleared after JS updates.

## Future Enhancements

*   Dynamic Multi Input and output 

## Contributing

Contributions, bug reports, and feature requests are welcome! Please feel free to open an issue or submit a pull request on the https://github.com/Adore021/ComfyPortal.git

## License

This project is licensed under the [MIT License]
