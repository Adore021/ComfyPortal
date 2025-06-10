// ComfyUI/custom_nodes/ComfyPortals/js/portal_manager_ui.js
import { app } from "/scripts/app.js";

export class PortalManagerPanel {
    constructor() {
        this.element = document.createElement("div");
        this.element.id = "comfy-portal-manager-panel";
        this.applyStyles();

        this.header = document.createElement("div");
        this.header.textContent = "Active Portals";
        this.applyHeaderStyles();

        this.closeButton = document.createElement("button");
        this.closeButton.textContent = "✖"; // Using a nicer 'X'
        this.applyCloseButtonStyles();
        this.closeButton.onclick = () => this.hide();

        this.contentArea = document.createElement("div"); // For the list itself
        this.applyContentAreaStyles();

        this.header.appendChild(this.closeButton);
        this.element.appendChild(this.header);
        this.element.appendChild(this.contentArea);

        document.body.appendChild(this.element);
        this.hide(); // Start hidden

        this.makeDraggable();
        console.log("[PortalManagerUI] Panel created.");
    }

    applyStyles() {
        Object.assign(this.element.style, {
            position: "fixed",
            top: "80px",
            right: "15px",
            width: "280px",
            maxHeight: "calc(100vh - 120px)", // Adjust based on your preference
            backgroundColor: "var(--comfy-menu-bg)",
            border: "1px solid var(--border-color)",
            borderRadius: "8px",
            boxShadow: "0 5px 15px rgba(0,0,0,0.25)",
            zIndex: "1001", // Ensure it's above most UI elements
            display: "none", // Initially hidden
            flexDirection: "column",
            fontFamily: "sans-serif",
            color: "var(--fg-color)",
            fontSize: "14px",
        });
    }

    applyHeaderStyles() {
        Object.assign(this.header.style, {
            padding: "8px 12px",
            backgroundColor: "var(--comfy-input-bg)", // Slightly different for header
            cursor: "move",
            borderBottom: "1px solid var(--border-color)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontWeight: "bold",
            borderTopLeftRadius: "8px",
            borderTopRightRadius: "8px",
        });
    }

    applyCloseButtonStyles() {
         Object.assign(this.closeButton.style, {
            background: "transparent",
            border: "none",
            color: "var(--fg-color)",
            cursor: "pointer",
            fontSize: "18px", // Make it a bit more prominent
            padding: "0 5px",
            lineHeight: "1"
        });
    }

    applyContentAreaStyles() {
        Object.assign(this.contentArea.style, {
            padding: "10px",
            overflowY: "auto", // Enable scrolling for many portals
            flexGrow: "1", // Allow content to take available space
        });
    }

    makeDraggable() {
        let isDragging = false;
        let offsetX, offsetY;
        const panel = this.element;
        const header = this.header;

        header.onmousedown = (e) => {
            if (e.target === this.closeButton || e.target.parentElement === this.closeButton) return; // Don't drag if close button
            isDragging = true;
            offsetX = e.clientX - panel.offsetLeft;
            offsetY = e.clientY - panel.offsetTop;
            panel.style.transition = "none"; // Disable transitions while dragging for responsiveness
            document.body.style.userSelect = "none"; // Prevent text selection during drag
            e.preventDefault();
        };

        document.onmousemove = (e) => {
            if (!isDragging) return;
            panel.style.left = `${e.clientX - offsetX}px`;
            panel.style.top = `${e.clientY - offsetY}px`;
        };

        document.onmouseup = () => {
            if (isDragging) {
                isDragging = false;
                panel.style.transition = ""; // Re-enable transitions
                document.body.style.userSelect = "";
            }
        };
    }

    updateList(portalsData) { // portalsData = [{name: "...", type: "..."}]
        this.contentArea.innerHTML = ""; // Clear previous list

        if (!portalsData || portalsData.length === 0) {
            const emptyMsg = document.createElement("p");
            emptyMsg.textContent = "No active portals defined.";
            emptyMsg.style.fontStyle = "italic";
            emptyMsg.style.textAlign = "center";
            emptyMsg.style.padding = "15px 0";
            this.contentArea.appendChild(emptyMsg);
            return;
        }

        const ul = document.createElement("ul");
        Object.assign(ul.style, {
            listStyle: "none",
            padding: "0",
            margin: "0",
        });

        portalsData.forEach(portal => {
            const li = document.createElement("li");
            Object.assign(li.style, {
                padding: "6px 2px",
                borderBottom: "1px solid var(--descrip-text-color)", // Use a lighter border
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
            });
            if (portal === portalsData[portalsData.length - 1]) { // No border for last item
                li.style.borderBottom = "none";
            }

            const nameSpan = document.createElement("span");
            nameSpan.textContent = portal.name;
            nameSpan.style.fontWeight = "600"; // Slightly bolder

            const typeSpan = document.createElement("span");
            typeSpan.textContent = portal.type || "*";
            typeSpan.style.fontSize = "0.85em";
            typeSpan.style.color = "var(--success-text)"; // Use a distinct color for type
            typeSpan.style.backgroundColor = "var(--comfy-input-bg)";
            typeSpan.style.padding = "2px 5px";
            typeSpan.style.borderRadius = "4px";


            li.appendChild(nameSpan);
            li.appendChild(typeSpan);
            ul.appendChild(li);
        });
        this.contentArea.appendChild(ul);
    }

    show() {
        this.element.style.display = "flex";
    }

    hide() {
        this.element.style.display = "none";
    }

    toggle() {
        if (this.element.style.display === "none") {
            this.show();
        } else {
            this.hide();
        }
    }
}

// Global instance to be initialized by the main extension script
export let portalManagerPanelInstance = null;

export function initializePortalManagerUI() {
    if (!portalManagerPanelInstance) {
        portalManagerPanelInstance = new PortalManagerPanel();
    }
    return portalManagerPanelInstance;
}