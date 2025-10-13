import { C as listen_to_event_and_reset_event, D as hydrating, E as render_effect, F as current_batch, G as tick, H as untrack, I as previous_batch, c as create_custom_element, p as push, J as prop, x as comment, o as first_child, i as if_block, b as append, j as pop, K as flushSync, g as from_html, a as attribute_effect, r as rest_props } from "./wc-utils-za2Oi3n3.js";
import { c as cn, b as bind_this } from "./button-CLUnrs-q.js";
function bind_value(input, get, set = get) {
  var batches = /* @__PURE__ */ new WeakSet();
  listen_to_event_and_reset_event(input, "input", async (is_reset) => {
    var value = is_reset ? input.defaultValue : input.value;
    value = is_numberlike_input(input) ? to_number(value) : value;
    set(value);
    if (current_batch !== null) {
      batches.add(current_batch);
    }
    await tick();
    if (value !== (value = get())) {
      var start = input.selectionStart;
      var end = input.selectionEnd;
      input.value = value ?? "";
      if (end !== null) {
        input.selectionStart = start;
        input.selectionEnd = Math.min(end, input.value.length);
      }
    }
  });
  if (
    // If we are hydrating and the value has since changed,
    // then use the updated value from the input instead.
    hydrating && input.defaultValue !== input.value || // If defaultValue is set, then value == defaultValue
    // TODO Svelte 6: remove input.value check and set to empty string?
    untrack(get) == null && input.value
  ) {
    set(is_numberlike_input(input) ? to_number(input.value) : input.value);
    if (current_batch !== null) {
      batches.add(current_batch);
    }
  }
  render_effect(() => {
    var value = get();
    if (input === document.activeElement) {
      var batch = (
        /** @type {Batch} */
        previous_batch ?? current_batch
      );
      if (batches.has(batch)) {
        return;
      }
    }
    if (is_numberlike_input(input) && value === to_number(input.value)) {
      return;
    }
    if (input.type === "date" && !value && !input.value) {
      return;
    }
    if (value !== input.value) {
      input.value = value ?? "";
    }
  });
}
function is_numberlike_input(input) {
  var type = input.type;
  return type === "number" || type === "range";
}
function to_number(value) {
  return value === "" ? null : +value;
}
function bind_files(input, get, set = get) {
  listen_to_event_and_reset_event(input, "change", () => {
    set(input.files);
  });
  if (
    // If we are hydrating and the value has since changed,
    // then use the updated value from the input instead.
    hydrating && input.files
  ) {
    set(input.files);
  }
  render_effect(() => {
    input.files = get();
  });
}
var root_1 = from_html(`<input/>`);
var root_2 = from_html(`<input/>`);
function Input($$anchor, $$props) {
  push($$props, true);
  let ref = prop($$props, "ref", 15, null), value = prop($$props, "value", 15), type = prop($$props, "type", 7), files = prop($$props, "files", 15), className = prop($$props, "class", 7), restProps = rest_props($$props, [
    "$$slots",
    "$$events",
    "$$legacy",
    "$$host",
    "ref",
    "value",
    "type",
    "files",
    "class"
  ]);
  var $$exports = {
    get ref() {
      return ref();
    },
    set ref($$value = null) {
      ref($$value);
      flushSync();
    },
    get value() {
      return value();
    },
    set value($$value) {
      value($$value);
      flushSync();
    },
    get type() {
      return type();
    },
    set type($$value) {
      type($$value);
      flushSync();
    },
    get files() {
      return files();
    },
    set files($$value) {
      files($$value);
      flushSync();
    },
    get class() {
      return className();
    },
    set class($$value) {
      className($$value);
      flushSync();
    }
  };
  var fragment = comment();
  var node = first_child(fragment);
  {
    var consequent = ($$anchor2) => {
      var input = root_1();
      attribute_effect(
        input,
        ($0) => ({ "data-slot": "input", class: $0, type: "file", ...restProps }),
        [
          () => cn("selection:bg-primary dark:bg-input/30 selection:text-primary-foreground border-input ring-offset-background placeholder:text-muted-foreground shadow-xs flex h-9 w-full min-w-0 rounded-md border bg-transparent px-3 pt-1.5 text-sm font-medium outline-none transition-[color,box-shadow] disabled:cursor-not-allowed disabled:opacity-50 md:text-sm", "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]", "aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive", className())
        ],
        void 0,
        void 0,
        true
      );
      bind_this(input, ($$value) => ref($$value), () => ref());
      bind_files(input, files);
      bind_value(input, value);
      append($$anchor2, input);
    };
    var alternate = ($$anchor2) => {
      var input_1 = root_2();
      attribute_effect(
        input_1,
        ($0) => ({ "data-slot": "input", class: $0, type: type(), ...restProps }),
        [
          () => cn("border-input bg-background selection:bg-primary dark:bg-input/30 selection:text-primary-foreground ring-offset-background placeholder:text-muted-foreground shadow-xs flex h-9 w-full min-w-0 rounded-md border px-3 py-1 text-base outline-none transition-[color,box-shadow] disabled:cursor-not-allowed disabled:opacity-50 md:text-sm", "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]", "aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive", className())
        ],
        void 0,
        void 0,
        true
      );
      bind_this(input_1, ($$value) => ref($$value), () => ref());
      bind_value(input_1, value);
      append($$anchor2, input_1);
    };
    if_block(node, ($$render) => {
      if (type() === "file") $$render(consequent);
      else $$render(alternate, false);
    });
  }
  append($$anchor, fragment);
  return pop($$exports);
}
create_custom_element(Input, { ref: {}, value: {}, type: {}, files: {}, class: {} }, [], [], true);
export {
  Input as I
};
