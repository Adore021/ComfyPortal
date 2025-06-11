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
                "value_1": (AlwaysEqualProxy("*"), {"label": "value_1"}), # Start with value_1
            },
            # "optional": { # We could add a widget for max inputs here later if desired
            # }
        }

    # Update nop_function to accept kwargs for future dynamic inputs
    def nop_function(self, portal_name, **kwargs):
        # kwargs will contain value_1, value_2, etc.
        print(f"[ComfyPortals] SetNamedPortal '{portal_name}' was executed with inputs: {kwargs.keys()}. (Python-side NOP).")
        # For now, we don't do anything with the multiple values on the backend.
        # The core logic is in JS graphToPrompt for linking.
        return {}

class GetNamedPortal:
    CATEGORY = "Utils/Portals"
    # Start with a single, generic output. JS will manage dynamic ones.
    # The name "value" here is just a placeholder for the first output.
    # JS will likely rename outputs to "output_1", "output_2", etc.
    RETURN_TYPES = (AlwaysEqualProxy("*"),)
    RETURN_NAMES = ("output_1",) # Start with one, JS will add/remove
    FUNCTION = "nop_function"

    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "portal_name": ("STRING", {"default": "_refresh_or_no_portals_"}),
            }
        }

    # The nop_function now needs to return a tuple with a number of None values
    # corresponding to the number of outputs the JS side has configured for this node instance.
    # However, the Python side doesn't easily know this.
    # A common approach is to have JS store the expected number of outputs on the node
    # instance if the backend *needs* to know, or the backend just returns a single None
    # and relies on JS graphToPrompt to only make links for connected outputs.
    # For now, let's keep it simple: JS will only try to link outputs that exist and are connected.
    # The backend can just return one `None` for the base definition.

    def nop_function(self, portal_name):
        # print(f"[ComfyPortals] GetNamedPortal '{portal_name}' (Python NOP). JS manages outputs.")
        # This tuple's length should ideally match node.outputs.length, but for NOP, one is often fine.
        # Or, if we want to be slightly more robust for future backend processing (not portals):
        # num_outputs = getattr(self, "_js_configured_outputs_count", 1) # If JS sets this
        # return (None,) * num_outputs
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

print("[ComfyPortals] Custom Portal nodes loaded (v-Next.6 - Portal Manager UI).")