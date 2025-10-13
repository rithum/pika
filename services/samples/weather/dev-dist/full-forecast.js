import { c as create_custom_element, p as push, d as append_styles, s as state, e as proxy, u as user_effect, k as get, l as set, m as getPikaContext, g as from_html, h as sibling, n as child, i as if_block, t as template_effect, q as set_text, b as append, j as pop, w as reset } from "./wc-utils-za2Oi3n3.js";
import { e as each, i as index } from "./each-DO0Vkoj8.js";
import "./map-pin-CuHOD0LA.js";
var root_1 = from_html(`<p class="loading svelte-jf9sa6">Loading forecast...</p>`);
var root_3 = from_html(`<div class="forecast-card svelte-jf9sa6"><h3 class="svelte-jf9sa6"> </h3> <p class="date svelte-jf9sa6"> </p> <div class="icon svelte-jf9sa6"> </div> <div class="temps svelte-jf9sa6"><span class="high svelte-jf9sa6"> </span> <span class="low svelte-jf9sa6"> </span></div> <p class="conditions svelte-jf9sa6"> </p></div>`);
var root_2 = from_html(`<div class="forecast-grid svelte-jf9sa6"></div>`);
var root = from_html(`<div class="full-forecast svelte-jf9sa6"><header class="forecast-header svelte-jf9sa6"><h2 class="svelte-jf9sa6">5-Day Forecast</h2> <p class="location svelte-jf9sa6"> </p></header> <!></div>`);
const $$css = {
  hash: "svelte-jf9sa6",
  code: ".full-forecast.svelte-jf9sa6 {padding:2rem;background:linear-gradient(135deg, #667eea 0%, #764ba2 100%);min-height:100vh;color:white;}.forecast-header.svelte-jf9sa6 {margin-bottom:2rem;}.forecast-header.svelte-jf9sa6 h2:where(.svelte-jf9sa6) {margin:0;font-size:2rem;}.location.svelte-jf9sa6 {margin:0.5rem 0 0 0;font-size:1.25rem;opacity:0.9;}.forecast-grid.svelte-jf9sa6 {display:grid;grid-template-columns:repeat(auto-fit, minmax(200px, 1fr));gap:1.5rem;}.forecast-card.svelte-jf9sa6 {background:rgba(255, 255, 255, 0.1);backdrop-filter:blur(10px);border-radius:12px;padding:1.5rem;text-align:center;border:1px solid rgba(255, 255, 255, 0.2);}.forecast-card.svelte-jf9sa6 h3:where(.svelte-jf9sa6) {margin:0 0 0.25rem 0;font-size:1.25rem;}.date.svelte-jf9sa6 {margin:0 0 1rem 0;opacity:0.8;font-size:0.875rem;}.icon.svelte-jf9sa6 {font-size:3rem;margin:1rem 0;}.temps.svelte-jf9sa6 {display:flex;justify-content:center;gap:1rem;margin:1rem 0;font-size:1.5rem;font-weight:bold;}.high.svelte-jf9sa6 {color:#fbbf24;}.low.svelte-jf9sa6 {color:#93c5fd;}.conditions.svelte-jf9sa6 {margin:0.5rem 0 0 0;font-size:0.875rem;opacity:0.9;}.loading.svelte-jf9sa6 {text-align:center;padding:4rem;font-size:1.25rem;}"
};
function Full_forecast($$anchor, $$props) {
  push($$props, true);
  append_styles($$anchor, $$css);
  let forecast = state(proxy([]));
  let loading = state(true);
  let selectedCity = state("San Francisco");
  let initialized = state(false);
  let context = state(void 0);
  user_effect(() => {
    if (!get(initialized)) {
      init();
    }
  });
  async function init() {
    set(context, await getPikaContext($$props.$$host), true);
    set(initialized, true);
    const metadata = get(context).chatAppState.getWidgetMetadataAPI("weather", "full-forecast", get(context).instanceId, get(context).renderingContext);
    metadata.setMetadata({
      title: `5-Day Forecast - ${get(selectedCity)}`,
      actions: [
        {
          id: "change-city",
          title: "Change City",
          // map-pin icon svg
          iconSvg: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-map-pin-icon lucide-map-pin"><path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/></svg>',
          callback: () => {
            const newCity = prompt("Enter city name:", get(selectedCity));
            if (newCity) {
              set(selectedCity, newCity, true);
              metadata.updateTitle(`5-Day Forecast - ${get(selectedCity)}`);
              loadForecast();
            }
          }
        }
      ]
    });
    loadForecast();
  }
  async function loadForecast() {
    set(loading, true);
    setTimeout(
      () => {
        set(
          forecast,
          [
            {
              day: "Monday",
              date: "Oct 14",
              high: 75,
              low: 58,
              conditions: "Sunny",
              icon: "☀️"
            },
            {
              day: "Tuesday",
              date: "Oct 15",
              high: 73,
              low: 56,
              conditions: "Partly Cloudy",
              icon: "⛅"
            },
            {
              day: "Wednesday",
              date: "Oct 16",
              high: 70,
              low: 55,
              conditions: "Cloudy",
              icon: "☁️"
            },
            {
              day: "Thursday",
              date: "Oct 17",
              high: 68,
              low: 54,
              conditions: "Rain",
              icon: "🌧️"
            },
            {
              day: "Friday",
              date: "Oct 18",
              high: 72,
              low: 57,
              conditions: "Sunny",
              icon: "☀️"
            }
          ],
          true
        );
        set(loading, false);
      },
      500
    );
  }
  var div = root();
  var header = child(div);
  var p = sibling(child(header), 2);
  var text = child(p, true);
  reset(p);
  reset(header);
  var node = sibling(header, 2);
  {
    var consequent = ($$anchor2) => {
      var p_1 = root_1();
      append($$anchor2, p_1);
    };
    var alternate = ($$anchor2) => {
      var div_1 = root_2();
      each(div_1, 21, () => get(forecast), index, ($$anchor3, day) => {
        var div_2 = root_3();
        var h3 = child(div_2);
        var text_1 = child(h3, true);
        reset(h3);
        var p_2 = sibling(h3, 2);
        var text_2 = child(p_2, true);
        reset(p_2);
        var div_3 = sibling(p_2, 2);
        var text_3 = child(div_3, true);
        reset(div_3);
        var div_4 = sibling(div_3, 2);
        var span = child(div_4);
        var text_4 = child(span);
        reset(span);
        var span_1 = sibling(span, 2);
        var text_5 = child(span_1);
        reset(span_1);
        reset(div_4);
        var p_3 = sibling(div_4, 2);
        var text_6 = child(p_3, true);
        reset(p_3);
        reset(div_2);
        template_effect(() => {
          set_text(text_1, get(day).day);
          set_text(text_2, get(day).date);
          set_text(text_3, get(day).icon);
          set_text(text_4, `${get(day).high ?? ""}°`);
          set_text(text_5, `${get(day).low ?? ""}°`);
          set_text(text_6, get(day).conditions);
        });
        append($$anchor3, div_2);
      });
      reset(div_1);
      append($$anchor2, div_1);
    };
    if_block(node, ($$render) => {
      if (get(loading)) $$render(consequent);
      else $$render(alternate, false);
    });
  }
  reset(div);
  template_effect(() => set_text(text, get(selectedCity)));
  append($$anchor, div);
  pop();
}
customElements.define("full-forecast", create_custom_element(Full_forecast, {}, [], [], true));
