import comfy.utils

# Helper class (still useful for type declarations)
class AlwaysEqualProxy(str):
    def __eq__(self, _):
        return True
    def __ne__(self, _):
        return False

class SetNamedPortal:
    CATEGORY = "Utils/Portals"
    RETURN_TYPES = ()
    FUNCTION = "nop_function"
    OUTPUT_NODE = True

    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "portal_name": ("STRING", {"default": "my_portal"}),
                "value": (AlwaysEqualProxy("*"), ),
            }
        }

    def nop_function(self, portal_name, value):
        print(f"[ComfyPortals] SetNamedPortal '{portal_name}' was executed (Python-side NOP).")
        return {}

class GetNamedPortal:
    CATEGORY = "Utils/Portals"
    RETURN_TYPES = (AlwaysEqualProxy("*"), )
    RETURN_NAMES = ("value",)
    FUNCTION = "nop_function"

    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                # Change to STRING to allow any value from the frontend-populated combo.
                # The actual "combo" behavior will be managed by JS.
                "portal_name": ("STRING", {"default": "_refresh_or_no_portals_"}),
            }
        }

    def nop_function(self, portal_name):
        print(f"[ComfyPortals] GetNamedPortal for '{portal_name}' executed (Python-side NOP). Expecting data via temp link.")
        if portal_name == "_refresh_or_no_portals_" or portal_name == "_no_portals_found_":
            print(f"[ComfyPortals] Warning: GetNamedPortal '{getattr(self, 'id', 'unknown')}' has no valid portal selected ('{portal_name}').")
            # This won't cause a validation error anymore, but our graphToPrompt logic
            # should still skip making temp links for these placeholders.
        return (None,)

NODE_CLASS_MAPPINGS = {
    "SetNamedPortal": SetNamedPortal,
    "GetNamedPortal": GetNamedPortal,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "SetNamedPortal": "Set Named Portal (Input)",
    "GetNamedPortal": "Get Named Portal (Output)",
}

WEB_DIRECTORY = "./js"

print("[ComfyPortals] Custom Portal nodes loaded (v-Next.4 - Portal Manager UI).")