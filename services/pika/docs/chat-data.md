# Chat Data

## Overview

The chatbot returns responses in Markdown format, enhanced with custom XML tags that enable rich interactive components in the UI. The response text is parsed to identify these tags and render the appropriate UI elements.

## Supported XML Tags

### `<answer>` - Response Container

All agent responses must be enclosed within `<answer>` tags. This is the main container for all content.

Example:
```
<answer>
  Markdown content and other tags go here
</answer>
```

### `<prompt>` - Follow-up Suggestions

Used to suggest follow-up questions or commands that users can click on to continue the conversation.

- Each suggestion should be wrapped in its own `<prompt>` tag
- Text should be phrased from the user's perspective
- Multiple prompts can be included in a response

Example:
```
<prompt>Show weather forecast for New York</prompt>
<prompt>Compare temperatures in Miami and Phoenix</prompt>
```

### `<chart>` - Data Visualization

Embeds interactive charts rendered using Chart.js (version 4).

- Content must be valid Chart.js JSON configuration
- Must include `type` and `data` properties
- Supports various chart types (line, bar, pie, etc.)

Example:
```
<chart>
{
  "type": "line",
  "data": {
    "labels": ["May", "June", "July", "August"],
    "datasets": [{
      "label": "Avg Temperature (°C)",
      "data": [2, 3, 7, 12],
      "backgroundColor": "rgba(255,159,64,0.2)",
      "borderColor": "rgba(255,159,64,1)",
      "borderWidth": 1
    }]
  }
}
</chart>
```

### `<image>` - Embedded Images

Displays images within the response.

- Content should be a valid image URL

Example:
```
<image>https://example.com/weather-map.jpg</image>
```

### `<chat>` - Chat Subcomponent

Provides a way to embed chat-related content or interactions.

## Integration with UI

The UI parses the response content, identifies these XML tags, and renders the appropriate components:

1. Regular Markdown content is rendered as formatted text
2. `<prompt>` tags are rendered as clickable suggestion buttons
3. `<chart>` tags are rendered as interactive data visualizations
4. `<image>` tags are rendered as embedded images
5. `<chat>` tags are rendered as chat-specific UI components

## Example Complete Response

```
<answer>
## Weather Forecast for New York

Here's the temperature forecast for the next 7 days:

<chart>{
  "type": "bar",
  "data": {
    "labels": ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
    "datasets": [{
      "label": "Temperature (°F)",
      "data": [72, 75, 79, 76, 72, 68, 70],
      "backgroundColor": "rgba(54, 162, 235, 0.5)"
    }]
  }
}</chart>

There's a 30% chance of rain on Wednesday.

<image>https://example.com/nyc-weather-map.jpg</image>

You might want to ask:

<prompt>What's the chance of rain on the weekend?</prompt>
<prompt>Show me the humidity forecast</prompt>
<prompt>Compare with Boston weather</prompt>
</answer>