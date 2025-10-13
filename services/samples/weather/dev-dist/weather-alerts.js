import { c as create_custom_element, f as from_svg, a as attribute_effect, b as append, r as rest_props, p as push, d as append_styles, s as state, e as proxy, u as user_effect, k as get, l as set, m as getPikaContext, g as from_html, h as sibling, n as child, i as if_block, o as first_child, t as template_effect, q as set_text, j as pop, w as reset, x as comment, v as next, A as set_style } from "./wc-utils-za2Oi3n3.js";
import { e as each, i as index } from "./each-DO0Vkoj8.js";
import { B as Button } from "./button-CLUnrs-q.js";
import { R as Refresh_cw } from "./refresh-cw-pu7uKzd9.js";
var root$2 = from_svg(`<svg><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m9 18l6-6l-6-6"></path></svg>`);
function Chevron_right($$anchor, $$props) {
  const p = rest_props($$props, ["$$slots", "$$events", "$$legacy", "$$host"]);
  var svg = root$2();
  attribute_effect(svg, () => ({ viewBox: "0 0 24 24", width: "1.2em", height: "1.2em", ...p }));
  append($$anchor, svg);
}
create_custom_element(Chevron_right, {}, [], [], true);
var root$1 = from_svg(`<svg><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m21.73 18l-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3M12 9v4m0 4h.01"></path></svg>`);
function Triangle_alert($$anchor, $$props) {
  const p = rest_props($$props, ["$$slots", "$$events", "$$legacy", "$$host"]);
  var svg = root$1();
  attribute_effect(svg, () => ({ viewBox: "0 0 24 24", width: "1.2em", height: "1.2em", ...p }));
  append($$anchor, svg);
}
create_custom_element(Triangle_alert, {}, [], [], true);
var root_1 = from_html(`<span class="last-update svelte-1mb6amn"> </span>`);
var root_2 = from_html(`<!> `, 1);
var root_3 = from_html(`<p class="loading svelte-1mb6amn">Checking for alerts...</p>`);
var root_5 = from_html(`<p class="error svelte-1mb6amn"> </p>`);
var root_7 = from_html(`<p class="no-alerts svelte-1mb6amn">✓ No active alerts</p>`);
var root_10 = from_html(`Details <!>`, 1);
var root_9 = from_html(`<li class="alert-item svelte-1mb6amn"><div class="alert-content svelte-1mb6amn"><span class="severity svelte-1mb6amn"> </span> <h4 class="svelte-1mb6amn"> </h4> <p class="location svelte-1mb6amn"> </p> <p class="description svelte-1mb6amn"> </p></div> <!></li>`);
var root_8 = from_html(`<ul class="alerts-list svelte-1mb6amn"></ul>`);
var root = from_html(`<div class="weather-alerts svelte-1mb6amn"><div class="header svelte-1mb6amn"><div class="title-section svelte-1mb6amn"><h3 class="text-base font-semibold m-0">Weather Alerts</h3> <!></div> <!></div> <!></div>`);
const $$css = {
  hash: "svelte-1mb6amn",
  code: ".weather-alerts.svelte-1mb6amn {padding:0.75rem;background:white;border-radius:8px;box-shadow:0 2px 8px rgba(0, 0, 0, 0.1);}.header.svelte-1mb6amn {display:flex;justify-content:space-between;align-items:center;margin-bottom:0.75rem;}.title-section.svelte-1mb6amn {display:flex;flex-direction:column;gap:0.125rem;}.last-update.svelte-1mb6amn {font-size:0.65rem;color:#6b7280;}.alerts-list.svelte-1mb6amn {list-style:none;padding:0;margin:0;}.alert-item.svelte-1mb6amn {display:flex;justify-content:space-between;align-items:center;padding:0.75rem;border-left:3px solid;background:#fef2f2;border-radius:4px;margin-bottom:0.5rem;}.alert-content.svelte-1mb6amn h4:where(.svelte-1mb6amn) {margin:0.25rem 0;font-size:0.875rem;color:#111827;font-weight:600;}.alert-content.svelte-1mb6amn p:where(.svelte-1mb6amn) {margin:0.25rem 0 0 0;font-size:0.75rem;}.alert-content.svelte-1mb6amn .location:where(.svelte-1mb6amn) {color:#6b7280;font-weight:500;}.alert-content.svelte-1mb6amn .description:where(.svelte-1mb6amn) {color:#374151;margin-top:0.5rem;}.severity.svelte-1mb6amn {display:inline-block;font-size:0.625rem;font-weight:bold;padding:0.125rem 0.375rem;border-radius:3px;margin-bottom:0.375rem;}.loading.svelte-1mb6amn,\n    .no-alerts.svelte-1mb6amn,\n    .error.svelte-1mb6amn {text-align:center;padding:1.5rem;color:#6b7280;font-size:0.875rem;}.no-alerts.svelte-1mb6amn {color:#059669;}.error.svelte-1mb6amn {color:#ef4444;}"
};
function Weather_alerts($$anchor, $$props) {
  push($$props, true);
  append_styles($$anchor, $$css);
  const REFRESH_INTERVAL_MS = 60 * 60 * 1e3;
  let alerts = state(proxy([]));
  let loading = state(true);
  let error = state("");
  let initialized = state(false);
  let context = state(void 0);
  let lastRefreshTime = state("");
  user_effect(() => {
    if (!get(initialized)) {
      init();
    }
  });
  async function init() {
    set(context, await getPikaContext($$props.$$host), true);
    set(initialized, true);
    const metadata = get(context).chatAppState.getWidgetMetadataAPI("weather", "weather-alerts", get(context).instanceId, get(context).renderingContext);
    metadata.setMetadata({
      title: "Weather Alerts",
      actions: [
        {
          id: "check",
          title: "Check Alerts",
          // triangle-alert icon svg
          iconSvg: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-triangle-alert-icon lucide-triangle-alert"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>',
          callback: async () => {
            await checkAlerts();
          }
        }
      ]
    });
    const userWidgetData = get(context).chatAppState.getUserWidgetDataStoreState("weather", "weather-alerts");
    const cachedData = await userWidgetData.getValue("alertsData");
    if (cachedData) {
      set(lastRefreshTime, cachedData.timestamp, true);
      const allAlerts = [];
      for (const locAlerts of cachedData.response.locations) {
        for (const alert of locAlerts.alerts) {
          allAlerts.push({
            severity: alert.severity,
            title: alert.type,
            location: locAlerts.location,
            description: alert.description,
            issuedAt: alert.issuedAt,
            expiresAt: alert.expiresAt
          });
        }
      }
      set(alerts, allAlerts, true);
      const cacheAge = Date.now() - new Date(cachedData.timestamp).getTime();
      if (cacheAge > REFRESH_INTERVAL_MS) {
        await checkAlerts();
      }
    } else {
      await checkAlerts();
    }
    set(loading, false);
  }
  async function checkAlerts() {
    if (!get(context)) return;
    set(loading, true);
    set(error, "");
    try {
      const response = await get(context).chatAppState.invokeAgentAsComponent("weather", "weather-alerts", "checkAlerts", "Check weather alerts for San Francisco, New York, and London");
      const timestamp = (/* @__PURE__ */ new Date()).toISOString();
      const userWidgetData = get(context).chatAppState.getUserWidgetDataStoreState("weather", "weather-alerts");
      await userWidgetData.setValue("alertsData", { response, timestamp });
      set(lastRefreshTime, timestamp, true);
      const allAlerts = [];
      for (const locAlerts of response.locations) {
        for (const alert of locAlerts.alerts) {
          allAlerts.push({
            severity: alert.severity,
            title: alert.type,
            location: locAlerts.location,
            description: alert.description,
            issuedAt: alert.issuedAt,
            expiresAt: alert.expiresAt
          });
        }
      }
      set(alerts, allAlerts, true);
    } catch (e) {
      console.error("Error checking alerts:", e);
      set(error, "Failed to check alerts");
    } finally {
      set(loading, false);
    }
  }
  function getSeverityColor(severity) {
    const sev = severity.toLowerCase();
    if (sev.includes("severe")) return "#dc2626";
    if (sev.includes("warning")) return "#ef4444";
    if (sev.includes("watch")) return "#f59e0b";
    if (sev.includes("advisory")) return "#3b82f6";
    return "#6b7280";
  }
  async function viewDetails(alert) {
    get(context).chatAppState.renderTag("weather.full-forecast", "canvas", { alert });
  }
  var div = root();
  var div_1 = child(div);
  var div_2 = child(div_1);
  var node = sibling(child(div_2), 2);
  {
    var consequent = ($$anchor2) => {
      var span = root_1();
      var text = child(span);
      reset(span);
      template_effect(($0) => set_text(text, `Updated ${$0 ?? ""}`), [() => new Date(get(lastRefreshTime)).toLocaleTimeString()]);
      append($$anchor2, span);
    };
    if_block(node, ($$render) => {
      if (get(lastRefreshTime)) $$render(consequent);
    });
  }
  reset(div_2);
  var node_1 = sibling(div_2, 2);
  Button(node_1, {
    variant: "outline",
    size: "sm",
    onclick: checkAlerts,
    get disabled() {
      return get(loading);
    },
    children: ($$anchor2, $$slotProps) => {
      var fragment = root_2();
      var node_2 = first_child(fragment);
      Refresh_cw(node_2, { class: "h-3 w-3 mr-1" });
      var text_1 = sibling(node_2);
      template_effect(() => set_text(text_1, ` ${get(loading) ? "Checking..." : "Check"}`));
      append($$anchor2, fragment);
    },
    $$slots: { default: true }
  });
  reset(div_1);
  var node_3 = sibling(div_1, 2);
  {
    var consequent_1 = ($$anchor2) => {
      var p = root_3();
      append($$anchor2, p);
    };
    var alternate_2 = ($$anchor2) => {
      var fragment_1 = comment();
      var node_4 = first_child(fragment_1);
      {
        var consequent_2 = ($$anchor3) => {
          var p_1 = root_5();
          var text_2 = child(p_1, true);
          reset(p_1);
          template_effect(() => set_text(text_2, get(error)));
          append($$anchor3, p_1);
        };
        var alternate_1 = ($$anchor3) => {
          var fragment_2 = comment();
          var node_5 = first_child(fragment_2);
          {
            var consequent_3 = ($$anchor4) => {
              var p_2 = root_7();
              append($$anchor4, p_2);
            };
            var alternate = ($$anchor4) => {
              var ul = root_8();
              each(ul, 21, () => get(alerts), index, ($$anchor5, alert) => {
                var li = root_9();
                var div_3 = child(li);
                var span_1 = child(div_3);
                var text_3 = child(span_1, true);
                reset(span_1);
                var h4 = sibling(span_1, 2);
                var text_4 = child(h4, true);
                reset(h4);
                var p_3 = sibling(h4, 2);
                var text_5 = child(p_3, true);
                reset(p_3);
                var p_4 = sibling(p_3, 2);
                var text_6 = child(p_4, true);
                reset(p_4);
                reset(div_3);
                var node_6 = sibling(div_3, 2);
                Button(node_6, {
                  variant: "ghost",
                  size: "sm",
                  onclick: () => viewDetails(get(alert)),
                  children: ($$anchor6, $$slotProps) => {
                    next();
                    var fragment_3 = root_10();
                    var node_7 = sibling(first_child(fragment_3));
                    Chevron_right(node_7, { class: "h-3 w-3 ml-1" });
                    append($$anchor6, fragment_3);
                  },
                  $$slots: { default: true }
                });
                reset(li);
                template_effect(
                  ($0, $1, $2, $3) => {
                    set_style(li, `border-left-color: ${$0 ?? ""}`);
                    set_style(span_1, `background-color: ${$1 ?? ""}20; color: ${$2 ?? ""}`);
                    set_text(text_3, $3);
                    set_text(text_4, get(alert).title);
                    set_text(text_5, get(alert).location);
                    set_text(text_6, get(alert).description);
                  },
                  [
                    () => getSeverityColor(get(alert).severity),
                    () => getSeverityColor(get(alert).severity),
                    () => getSeverityColor(get(alert).severity),
                    () => get(alert).severity.toUpperCase()
                  ]
                );
                append($$anchor5, li);
              });
              reset(ul);
              append($$anchor4, ul);
            };
            if_block(
              node_5,
              ($$render) => {
                if (get(alerts).length === 0) $$render(consequent_3);
                else $$render(alternate, false);
              },
              true
            );
          }
          append($$anchor3, fragment_2);
        };
        if_block(
          node_4,
          ($$render) => {
            if (get(error)) $$render(consequent_2);
            else $$render(alternate_1, false);
          },
          true
        );
      }
      append($$anchor2, fragment_1);
    };
    if_block(node_3, ($$render) => {
      if (get(loading)) $$render(consequent_1);
      else $$render(alternate_2, false);
    });
  }
  reset(div);
  append($$anchor, div);
  pop();
}
customElements.define("weather-alerts", create_custom_element(Weather_alerts, {}, [], [], true));
