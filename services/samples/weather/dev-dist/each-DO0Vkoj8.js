import { V as create_text, L as block, k as get, W as derived_safe_equal, X as should_defer_append, F as current_batch, Y as array_from, Z as is_array, _ as internal_set, N as branch, $ as mutable_source, a0 as source, D as hydrating, a1 as resume_effect, a2 as pause_effect, a3 as EACH_INDEX_REACTIVE, a4 as INERT, P as destroy_effect, a5 as EACH_ITEM_REACTIVE, a6 as EACH_ITEM_IMMUTABLE, a7 as get_next_sibling, a8 as pause_children, a9 as clear_text_content, aa as run_out_transitions, ab as active_effect, ac as set_hydrate_node, ad as get_first_child, ae as hydrate_next, af as read_hydration_instruction, ag as HYDRATION_START_ELSE, ah as skip_nodes, ai as set_hydrating, Q as hydrate_node, aj as COMMENT_NODE, ak as HYDRATION_END } from "./wc-utils-za2Oi3n3.js";
function index(_, i) {
  return i;
}
function pause_effects(state, items, controlled_anchor) {
  var items_map = state.items;
  var transitions = [];
  var length = items.length;
  for (var i = 0; i < length; i++) {
    pause_children(items[i].e, transitions, true);
  }
  var is_controlled = length > 0 && transitions.length === 0 && controlled_anchor !== null;
  if (is_controlled) {
    var parent_node = (
      /** @type {Element} */
      /** @type {Element} */
      controlled_anchor.parentNode
    );
    clear_text_content(parent_node);
    parent_node.append(
      /** @type {Element} */
      controlled_anchor
    );
    items_map.clear();
    link(state, items[0].prev, items[length - 1].next);
  }
  run_out_transitions(transitions, () => {
    for (var i2 = 0; i2 < length; i2++) {
      var item = items[i2];
      if (!is_controlled) {
        items_map.delete(item.k);
        link(state, item.prev, item.next);
      }
      destroy_effect(item.e, !is_controlled);
    }
  });
}
function each(node, flags, get_collection, get_key, render_fn, fallback_fn = null) {
  var anchor = node;
  var state = { flags, items: /* @__PURE__ */ new Map(), first: null };
  {
    var parent_node = (
      /** @type {Element} */
      node
    );
    anchor = hydrating ? set_hydrate_node(
      /** @type {Comment | Text} */
      get_first_child(parent_node)
    ) : parent_node.appendChild(create_text());
  }
  if (hydrating) {
    hydrate_next();
  }
  var fallback = null;
  var was_empty = false;
  var offscreen_items = /* @__PURE__ */ new Map();
  var each_array = derived_safe_equal(() => {
    var collection = get_collection();
    return is_array(collection) ? collection : collection == null ? [] : array_from(collection);
  });
  var array;
  var each_effect;
  function commit() {
    reconcile(
      each_effect,
      array,
      state,
      offscreen_items,
      anchor,
      render_fn,
      flags,
      get_key,
      get_collection
    );
    if (fallback_fn !== null) {
      if (array.length === 0) {
        if (fallback) {
          resume_effect(fallback);
        } else {
          fallback = branch(() => fallback_fn(anchor));
        }
      } else if (fallback !== null) {
        pause_effect(fallback, () => {
          fallback = null;
        });
      }
    }
  }
  block(() => {
    each_effect ??= /** @type {Effect} */
    active_effect;
    array = /** @type {V[]} */
    get(each_array);
    var length = array.length;
    if (was_empty && length === 0) {
      return;
    }
    was_empty = length === 0;
    let mismatch = false;
    if (hydrating) {
      var is_else = read_hydration_instruction(anchor) === HYDRATION_START_ELSE;
      if (is_else !== (length === 0)) {
        anchor = skip_nodes();
        set_hydrate_node(anchor);
        set_hydrating(false);
        mismatch = true;
      }
    }
    if (hydrating) {
      var prev = null;
      var item;
      for (var i = 0; i < length; i++) {
        if (hydrate_node.nodeType === COMMENT_NODE && /** @type {Comment} */
        hydrate_node.data === HYDRATION_END) {
          anchor = /** @type {Comment} */
          hydrate_node;
          mismatch = true;
          set_hydrating(false);
          break;
        }
        var value = array[i];
        var key = get_key(value, i);
        item = create_item(
          hydrate_node,
          state,
          prev,
          null,
          value,
          key,
          i,
          render_fn,
          flags,
          get_collection
        );
        state.items.set(key, item);
        prev = item;
      }
      if (length > 0) {
        set_hydrate_node(skip_nodes());
      }
    }
    if (hydrating) {
      if (length === 0 && fallback_fn) {
        fallback = branch(() => fallback_fn(anchor));
      }
    } else {
      if (should_defer_append()) {
        var keys = /* @__PURE__ */ new Set();
        var batch = (
          /** @type {Batch} */
          current_batch
        );
        for (i = 0; i < length; i += 1) {
          value = array[i];
          key = get_key(value, i);
          var existing = state.items.get(key) ?? offscreen_items.get(key);
          if (existing) {
            {
              update_item(existing, value, i);
            }
          } else {
            item = create_item(
              null,
              state,
              null,
              null,
              value,
              key,
              i,
              render_fn,
              flags,
              get_collection,
              true
            );
            offscreen_items.set(key, item);
          }
          keys.add(key);
        }
        for (const [key2, item2] of state.items) {
          if (!keys.has(key2)) {
            batch.skipped_effects.add(item2.e);
          }
        }
        batch.add_callback(commit);
      } else {
        commit();
      }
    }
    if (mismatch) {
      set_hydrating(true);
    }
    get(each_array);
  });
  if (hydrating) {
    anchor = hydrate_node;
  }
}
function reconcile(each_effect, array, state, offscreen_items, anchor, render_fn, flags, get_key, get_collection) {
  var length = array.length;
  var items = state.items;
  var first = state.first;
  var current = first;
  var seen;
  var prev = null;
  var matched = [];
  var stashed = [];
  var value;
  var key;
  var item;
  var i;
  for (i = 0; i < length; i += 1) {
    value = array[i];
    key = get_key(value, i);
    item = items.get(key);
    if (item === void 0) {
      var pending = offscreen_items.get(key);
      if (pending !== void 0) {
        offscreen_items.delete(key);
        items.set(key, pending);
        var next = prev ? prev.next : current;
        link(state, prev, pending);
        link(state, pending, next);
        move(pending, next, anchor);
        prev = pending;
      } else {
        var child_anchor = current ? (
          /** @type {TemplateNode} */
          current.e.nodes_start
        ) : anchor;
        prev = create_item(
          child_anchor,
          state,
          prev,
          prev === null ? state.first : prev.next,
          value,
          key,
          i,
          render_fn,
          flags,
          get_collection
        );
      }
      items.set(key, prev);
      matched = [];
      stashed = [];
      current = prev.next;
      continue;
    }
    {
      update_item(item, value, i);
    }
    if ((item.e.f & INERT) !== 0) {
      resume_effect(item.e);
    }
    if (item !== current) {
      if (seen !== void 0 && seen.has(item)) {
        if (matched.length < stashed.length) {
          var start = stashed[0];
          var j;
          prev = start.prev;
          var a = matched[0];
          var b = matched[matched.length - 1];
          for (j = 0; j < matched.length; j += 1) {
            move(matched[j], start, anchor);
          }
          for (j = 0; j < stashed.length; j += 1) {
            seen.delete(stashed[j]);
          }
          link(state, a.prev, b.next);
          link(state, prev, a);
          link(state, b, start);
          current = start;
          prev = b;
          i -= 1;
          matched = [];
          stashed = [];
        } else {
          seen.delete(item);
          move(item, current, anchor);
          link(state, item.prev, item.next);
          link(state, item, prev === null ? state.first : prev.next);
          link(state, prev, item);
          prev = item;
        }
        continue;
      }
      matched = [];
      stashed = [];
      while (current !== null && current.k !== key) {
        if ((current.e.f & INERT) === 0) {
          (seen ??= /* @__PURE__ */ new Set()).add(current);
        }
        stashed.push(current);
        current = current.next;
      }
      if (current === null) {
        continue;
      }
      item = current;
    }
    matched.push(item);
    prev = item;
    current = item.next;
  }
  if (current !== null || seen !== void 0) {
    var to_destroy = seen === void 0 ? [] : array_from(seen);
    while (current !== null) {
      if ((current.e.f & INERT) === 0) {
        to_destroy.push(current);
      }
      current = current.next;
    }
    var destroy_length = to_destroy.length;
    if (destroy_length > 0) {
      var controlled_anchor = length === 0 ? anchor : null;
      pause_effects(state, to_destroy, controlled_anchor);
    }
  }
  each_effect.first = state.first && state.first.e;
  each_effect.last = prev && prev.e;
  for (var unused of offscreen_items.values()) {
    destroy_effect(unused.e);
  }
  offscreen_items.clear();
}
function update_item(item, value, index2, type) {
  {
    internal_set(item.v, value);
  }
  {
    item.i = index2;
  }
}
function create_item(anchor, state, prev, next, value, key, index2, render_fn, flags, get_collection, deferred) {
  var reactive = (flags & EACH_ITEM_REACTIVE) !== 0;
  var mutable = (flags & EACH_ITEM_IMMUTABLE) === 0;
  var v = reactive ? mutable ? mutable_source(value, false, false) : source(value) : value;
  var i = (flags & EACH_INDEX_REACTIVE) === 0 ? index2 : source(index2);
  var item = {
    i,
    v,
    k: key,
    a: null,
    // @ts-expect-error
    e: null,
    prev,
    next
  };
  try {
    if (anchor === null) {
      var fragment = document.createDocumentFragment();
      fragment.append(anchor = create_text());
    }
    item.e = branch(() => render_fn(
      /** @type {Node} */
      anchor,
      v,
      i,
      get_collection
    ), hydrating);
    item.e.prev = prev && prev.e;
    item.e.next = next && next.e;
    if (prev === null) {
      if (!deferred) {
        state.first = item;
      }
    } else {
      prev.next = item;
      prev.e.next = item.e;
    }
    if (next !== null) {
      next.prev = item;
      next.e.prev = item.e;
    }
    return item;
  } finally {
  }
}
function move(item, next, anchor) {
  var end = item.next ? (
    /** @type {TemplateNode} */
    item.next.e.nodes_start
  ) : anchor;
  var dest = next ? (
    /** @type {TemplateNode} */
    next.e.nodes_start
  ) : anchor;
  var node = (
    /** @type {TemplateNode} */
    item.e.nodes_start
  );
  while (node !== null && node !== end) {
    var next_node = (
      /** @type {TemplateNode} */
      get_next_sibling(node)
    );
    dest.before(node);
    node = next_node;
  }
}
function link(state, prev, next) {
  if (prev === null) {
    state.first = next;
  } else {
    prev.next = next;
    prev.e.next = next && next.e;
  }
  if (next !== null) {
    next.prev = prev;
    next.e.prev = prev && prev.e;
  }
}
export {
  each as e,
  index as i
};
