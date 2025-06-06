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
                # Changed to STRING to avoid backend validation errors with dynamic COMBOs
                "portal_name": ("STRING", {"default": "_type_portal_name_"}),
            }
        }

    def nop_function(self, portal_name):
        print(f"[ComfyPortals] GetNamedPortal for '{portal_name}' executed (Python-side NOP). Expecting data via temp link.")
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

print("[ComfyPortals] Custom Portal nodes loaded (v-Next.1 - Virtual Wiring, STRING input for Get).")