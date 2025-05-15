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