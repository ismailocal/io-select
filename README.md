# IO Select

A modern and customizable jQuery select plugin. Styled with Tailwind CSS, featuring search functionality and multiple selection support.

## Demo

Check out the live demo here: [https://ismailocal.github.io/io-select/examples/index.html](https://ismailocal.github.io/io-select/examples/index.html)

## Features

- 🎨 Modern and responsive design
- 🔍 Search functionality
- ✨ Multiple selection support
- 🌙 Dark mode support
- ♿ Accessibility support
- 🎯 Easy integration
- 📱 Mobile friendly
- ❌ Deselection support for single select
- 🔄 Keyboard navigation

## Installation

Install via npm:

```bash
npm install io-select
```

## Usage

HTML:
```html
<!-- Basic Usage -->
<select id="basicSelect">
  <option value=""></option>
  <option value="1">Option 1</option>
  <option value="2">Option 2</option>
  <option value="3">Option 3</option>
</select>

<!-- Multiple Selection -->
<select id="multiSelect" multiple>
  <option value="1">Option 1</option>
  <option value="2">Option 2</option>
  <option value="3">Option 3</option>
</select>
```

JavaScript:
```javascript
import 'io-select';
import $ from 'jquery';

// Basic usage
$('#basicSelect').ioSelect();

// With custom options
$('#multiSelect').ioSelect({
  placeholder: 'Make a selection',
  searchPlaceholder: 'Search...',
  noResultsText: 'No results found',
  searchable: true
});
```

## Settings

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| placeholder | string | 'Make a selection' | Text to display when no selection is made |
| searchPlaceholder | string | 'Search...' | Placeholder text for the search input |
| noResultsText | string | 'No results found' | Text to display when no search results are found |
| searchable | boolean | true | Enable/disable search functionality |

## Ajax Support

IO Select can fetch data remotely using Ajax. To enable Ajax functionality, provide an `ajax` object in the settings.

| Ajax Option         | Type     | Default        | Description                                                                                                                               |
|---------------------|----------|----------------|-------------------------------------------------------------------------------------------------------------------------------------------|
| `ajax`              | object   | `null`         | Main configuration object for Ajax. If provided, Ajax mode is enabled.                                                                  |
| `ajax.url`          | string   | `''`           | The URL to which the Ajax request will be sent.                                                                                           |
| `ajax.type`         | string   | `'GET'`        | The HTTP method for the Ajax request (e.g., 'GET', 'POST').                                                                               |
| `ajax.dataType`     | string   | `'json'`       | The expected data type of the server's response.                                                                                          |
| `ajax.delay`        | number   | `250`          | Debounce delay in milliseconds before sending the Ajax request after the user stops typing.                                                 |
| `ajax.data`         | function | (see desc.)    | A function that returns an object of parameters to send with the request. <br> It receives `params` object with `term` (search term) and `page` (current page, defaults to 1). <br> Example: `function(params) { return { search: params.term, p: params.page }; }` |
| `ajax.processResults` | function | (see desc.)    | A function to process the raw Ajax response before rendering. <br> It receives `data` (response from server) and `params` (request parameters). <br> It **must** return an array of objects in the format `[{ id: 'uniqueValue', name: 'DisplayText' }]`. <br> *Note: Future versions might support Select2-style return objects for pagination.* |
| `ajax.cache`        | boolean  | `false`        | If set to `true`, Ajax responses will be cached locally to avoid redundant requests for the same search term and parameters.                |

**Example of Ajax Configuration:**

```javascript
$('#myAjaxSelect').ioSelect({
  placeholder: 'Search for an item...',
  searchPlaceholder: 'Type to begin searching',
  ajax: {
    url: 'https://api.example.com/items',
    dataType: 'json',
    delay: 300,
    data: function(params) {
      return {
        q: params.term, // Search term
        page: params.page || 1 // Page number
      };
    },
    processResults: function(data, params) {
      // Assuming server returns data in format like: { results: [{id: 1, text: 'Item 1'}, ...] }
      // We need to transform it to: [{ id: 1, name: 'Item 1'}, ...]
      return data.results.map(function(item) {
        return {
          id: item.id,
          name: item.text
        };
      });
    },
    cache: true
  }
});
```

**Loading and Error Handling:**
The plugin automatically displays a "Loading..." message in the dropdown while an Ajax request is in progress. If the request fails or an error occurs, an error message will be shown.

## Methods

### destroy
Reverts the select element to its original state:

```javascript
$('#mySelect').ioSelect('destroy');
```

## Keyboard Navigation

- `Enter` or `Space`: Open/close dropdown
- `Escape`: Close dropdown
- `Tab`: Navigate through elements

## Accessibility

IO Select is built with accessibility in mind:
- ARIA attributes for screen readers
- Keyboard navigation support
- Focus management
- Screen reader friendly markup

## Browser Support

- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)
- Opera (latest)

## Development

1. Clone the repository
2. Install dependencies: `npm install`
3. Start development server: `npm run dev`
4. Build: `npm run build`

## License

MIT 