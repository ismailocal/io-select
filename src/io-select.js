import $ from 'jquery';

const IOSelect = (function () {
    'use strict';

    if (typeof $ === 'undefined') {
        console.error('IO Select requires jQuery');
        return;
    }

    // Note: OPTION_HEIGHT and VISIBLE_OPTIONS_BUFFER are now moved into settings defaults
    function debounce(func, wait) {
        let timeout;
        return function(...args) {
            const context = this;
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(context, args), wait);
        };
    }

    // IO Select Plugin
    $.fn.ioSelect = function (options) {
        // If a string parameter is provided, it's a method call
        if (typeof options === 'string') {
            const method = options;

            switch (method) {
                case 'destroy':
                    return this.each(function () {
                        const $select = $(this);
                        const $container = $select.next('.io-select-container');

                        // Clear event listeners
                        $container.find('*').off();
                        $container.off(); // Clear container's own event listeners
                        $(document).off('click.io-select.' + $select.attr('id')); // Namespaced event listener

                        // Remove container
                        $container.remove();

                        // Show select element
                        $select.show();
                    });
                default:
                    console.error(`IO Select: Method ${method} does not exist`);
                    return this;
            }
        }

        // Default settings
        const defaults = {
            placeholder: 'Make a selection',
            searchPlaceholder: 'Search...',
            noResultsText: 'No results found',
            searchable: true,
            virtualScroll: true,
            optionHeight: 36,       // Default height of an option item in pixels
            virtualScrollBuffer: 5  // Number of options to render above/below visible area
        };

        // Merge user settings with defaults
        const settings = $.extend({}, defaults, options);

        // Process each select element
        return this.each(function () {
            const $select = $(this);
            const isMultiple = $select.prop('multiple');
            let currentFilteredOptions = []; // Holds the currently filtered list of options

            // Get all options
            const allOptions = Array.from($select.find('option')).map(option => ({
                id: option.value,
                name: option.text
            })).filter(option => option.id !== ''); // Filter empty option

            // Create main container
            const $container = $('<div>').addClass('io-select-container relative');

            // Create selection box
            const $selectBox = $('<div>').addClass(`
                flex items-center justify-between bg-gray-50
                border border-gray-300 text-gray-900 text-sm rounded-lg
                focus:ring-blue-500 focus:border-blue-500 w-full p-2.5
                dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400
                dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500
                cursor-pointer
            `).attr({
                'role': 'combobox',
                'aria-haspopup': 'listbox',
                'aria-expanded': 'false',
                'aria-controls': 'io-select-dropdown-' + $select.attr('id'),
                'tabindex': '0'
            });

            // Selected items container
            const $selectedContainer = $('<div>').addClass('flex flex-wrap gap-1');

            // Arrow icon
            const $arrow = $(`
                <svg class="w-4 h-4 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
                </svg>
            `);

            // Dropdown container
            const $dropdown = $('<div>').addClass(`
                absolute z-10 mt-1 w-full bg-white border border-gray-300
                rounded-lg shadow-lg dark:bg-gray-700 dark:border-gray-600
                max-h-60 overflow-y-auto hidden
            `).attr({
                'id': 'io-select-dropdown-' + $select.attr('id'),
                'role': 'listbox',
                'aria-multiselectable': isMultiple ? 'true' : 'false'
            });

            // Search box
            let $searchInput = null;

            if (settings.searchable) {
                const $searchContainer = $('<div>').addClass('p-2');
                $searchInput = $('<input>').addClass(`
                    text-sm w-full p-2 border border-gray-300 rounded-md
                    dark:bg-gray-600 dark:border-gray-500 dark:text-white
                    focus:outline-none focus:ring-0 focus:border-blue-500
                `).attr({
                    type: 'text',
                    placeholder: settings.searchPlaceholder
                });

                $searchContainer.append($searchInput);
                $dropdown.append($searchContainer);

                // Search functionality
                $searchInput.on('keyup', function () {
                    const searchTerm = $(this).val().toLowerCase();
                    filterOptions(searchTerm);
                });
            }

            let $optionsList;
            let $optionsSizer = null; // Initialize to null, only created if virtualScroll is true

            if (settings.virtualScroll) {
                $optionsList = $('<ul>').css({
                    position: 'relative',
                    overflow: 'hidden',
                    // height will be implicitly set by $dropdown's max-height
                });
                $optionsSizer = $('<div>').css({ // Sizer div for scrollbar
                    width: '100%',
                    opacity: 0,
                });
                $optionsList.append($optionsSizer);
            } else {
                $optionsList = $('<ul>').addClass('py-1'); // Original class for padding
            }
            $dropdown.append($optionsList);

            // Update selected items
            function updateSelectedItems() {
                $selectedContainer.empty();
                const selected = getSelectedItems();
                const hasValidSelection = selected.some(item => item.id !== '');

                if (!hasValidSelection) {
                    $selectedContainer.append($('<span>').addClass('text-gray-400').text(settings.placeholder));
                } else {
                    selected.forEach(item => {
                        if (item.id === '') return; // Don't show empty option
                        const $tag = $('<div>').addClass(`
                            bg-blue-100 text-blue-800 text-xs font-medium
                            px-2 py-0.5 rounded dark:bg-blue-900 dark:text-blue-300
                            flex items-center
                        `);

                        $tag.append($('<span>').text(item.name));

                        const $removeBtn = $('<button>').addClass('ml-1 text-xs font-bold').text('×');
                        $removeBtn.on('click', function (e) {
                            e.stopPropagation();
                            removeItem(item.id);
                        });
                        $tag.append($removeBtn);

                        $selectedContainer.append($tag);
                    });
                }

                // Update original select
                if (!isMultiple) {
                    const currentSelected = $select.find('option:selected');
                    if (!hasValidSelection || currentSelected.val() === '') {
                        $select.find('option').prop('selected', false);
                        $select.find('option[value=""]').prop('selected', true);
                    }
                }
                $select.trigger('change');
            }

            // Get selected items
            function getSelectedItems() {
                return Array.from($select.find('option:selected')).map(option => ({
                    id: option.value,
                    name: option.text
                }));
            }

            // Add/remove item
            function toggleItem(itemId) {
                if (itemId === '') return; // Don't process empty option
                const $option = $select.find(`option[value="${itemId}"]`);
                const isCurrentlySelected = $option.prop('selected');

                if (isMultiple) {
                    $option.prop('selected', !isCurrentlySelected);
                } else {
                    if (isCurrentlySelected) {
                        // Remove selection and select empty option
                        $select.find('option').prop('selected', false);
                        $select.find('option[value=""]').prop('selected', true);
                    } else {
                        // Make new selection
                        $select.find('option').prop('selected', false);
                        $option.prop('selected', true);
                    }
                    hideDropdown();
                }

                updateSelectedItems();
            }

            // Remove item
            function removeItem(itemId) {
                $select.find(`option[value="${itemId}"]`).prop('selected', false);
                updateSelectedItems();
            }

            // Filter options
            // Filter options
            function filterOptions(searchTerm) {
                const newFilteredOptions = allOptions.filter(item =>
                    !searchTerm || item.name.toLowerCase().includes(searchTerm.toLowerCase())
                );
                currentFilteredOptions = newFilteredOptions; // Always update this for other logic

                if (settings.virtualScroll) {
                    if (!$optionsSizer) { // Should not happen if initialized correctly, but as a safeguard
                        console.error("IO Select: $optionsSizer not initialized for virtual scroll.");
                        return;
                    }
                    $optionsSizer.height(currentFilteredOptions.length * settings.optionHeight);
                    $dropdown.scrollTop(0); // Reset scroll position for virtual scroll
                    renderVisibleOptions(); // Render initial visible options for virtual scroll
                } else {
                    renderAllOptions(); // Render all for non-virtual scroll
                }
            }

            // Render all options (non-virtualized)
            function renderAllOptions() {
                $optionsList.empty(); // Clear all previous items

                if (currentFilteredOptions.length === 0) {
                    const $noResults = $('<li>').addClass(`
                        text-sm px-3 py-2 text-gray-500 dark:text-gray-400
                        cursor-default text-center
                    `).text(settings.noResultsText); // No specific class needed like 'io-select-no-results' unless for consistency
                    $optionsList.append($noResults);
                } else {
                    currentFilteredOptions.forEach(item => {
                        const $option = createOptionElement(item);
                        // No special positioning needed for non-virtualized items
                        $optionsList.append($option);
                    });
                }
            }

            // Render only visible options (virtualized)
            function renderVisibleOptions() {
                if (!settings.virtualScroll || !$optionsSizer) return; // Should only be called if virtualScroll is true

                const scrollTop = $dropdown.scrollTop();
                const dropdownHeight = $dropdown.height();

                // Clear previous options, but not the sizer or a potential noResults message
                $optionsList.children().not($optionsSizer).not('.io-select-no-results').remove();

                // Remove previous no results message if it exists
                $optionsList.find('.io-select-no-results').remove();

                if (currentFilteredOptions.length === 0) {
                    $optionsSizer.height(0); // Ensure sizer is 0 if no results
                    const $noResults = $('<li>').addClass(`
                        text-sm px-3 py-2 text-gray-500 dark:text-gray-400
                        cursor-default text-center io-select-no-results
                    `).text(settings.noResultsText); // Specific class for targeted removal
                    $optionsList.append($noResults);
                    return;
                }

                $optionsSizer.height(currentFilteredOptions.length * settings.optionHeight);

                const startIndex = Math.max(0, Math.floor(scrollTop / settings.optionHeight) - settings.virtualScrollBuffer);
                const endIndex = Math.min(currentFilteredOptions.length, Math.ceil((scrollTop + dropdownHeight) / settings.optionHeight) + settings.virtualScrollBuffer);

                for (let i = startIndex; i < endIndex; i++) {
                    const item = currentFilteredOptions[i];
                    const $option = createOptionElement(item);
                    $option.css({
                        position: 'absolute',
                        top: (i * settings.optionHeight) + 'px',
                        width: '100%',
                        left: 0
                    });
                    $optionsList.append($option);
                }
            }

            // Create option element
            function createOptionElement(item) {
                const $option = $('<li>').addClass(`
                    text-sm px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-600
                    cursor-pointer flex items-center
                `).attr({
                    'role': 'option',
                    'aria-selected': 'false',
                    'id': `io-select-option-${$select.attr('id')}-${item.id}`
                });

                let $checkbox = null; // Initialize $checkbox to null
                if (isMultiple) { // Check if isMultiple is true
                    $checkbox = $('<input>').attr({ // Create checkbox only if isMultiple is true
                        type: 'checkbox',
                        class: 'mr-2',
                        'aria-hidden': 'true' // Hide for screen readers, option role is already present
                    });

                    // Check checkbox status
                    const isSelected = $select.find(`option[value="${item.id}"]`).prop('selected');
                    $checkbox.prop('checked', isSelected);
                    $option.attr('aria-selected', isSelected.toString());

                    $option.append($checkbox); // Append checkbox only if isMultiple is true
                } else {
                    // For single select, still need to set aria-selected based on the actual select option
                    const isSelected = $select.find(`option[value="${item.id}"]`).prop('selected');
                    $option.attr('aria-selected', isSelected.toString());
                }


                const $text = $('<span>').text(item.name);
                $option.append($text); // Append text regardless of isMultiple

                $option.on('click', function () {
                    toggleItem(item.id);
                    // Update checkbox status only if isMultiple is true
                    if (isMultiple && $checkbox) {
                        const newSelected = $select.find(`option[value="${item.id}"]`).prop('selected');
                        $checkbox.prop('checked', newSelected);
                    }
                    // Always update aria-selected for the option itself
                    const newSelectedState = $select.find(`option[value="${item.id}"]`).prop('selected');
                    $option.attr('aria-selected', newSelectedState.toString());
                });

                return $option;
            }

            // Add keyboard navigation
            $selectBox.on('keydown', function (e) {
                switch (e.keyCode) {
                    case 13: // Enter
                    case 32: // Space
                        e.preventDefault();
                        toggleDropdown();
                        break;
                    case 27: // Escape
                        if (!$dropdown.hasClass('hidden')) {
                            e.preventDefault();
                            hideDropdown();
                        }
                        break;
                }
            });

            // Show/hide dropdown
            function toggleDropdown() {
                const isExpanded = !$dropdown.hasClass('hidden');
                $dropdown.toggleClass('hidden');
                $selectBox.attr('aria-expanded', (!isExpanded).toString());
                if (!isExpanded) {
                    const searchTerm = settings.searchable && $searchInput ? $searchInput.val().toLowerCase() : '';
                    filterOptions(searchTerm);
                }
            }

            function hideDropdown() {
                $dropdown.addClass('hidden');
                $selectBox.attr('aria-expanded', 'false');
            }

            // Event listeners
            $selectBox.on('click', toggleDropdown);

            if (settings.virtualScroll) {
                let debouncedRender = debounce(renderVisibleOptions, 50); // Debounce with 50ms delay
                $dropdown.on('scroll.io-select-virtual', debouncedRender);
            }
            // No scroll listener needed if not virtual scrolling, as all options are rendered

            $(document).on('click.io-select.' + $select.attr('id'), function (e) {
                if (!$(e.target).closest('.io-select-container').length) {
                    hideDropdown();
                }
            });

            // Combine elements
            $selectBox.append($selectedContainer).append($arrow);
            $container.append($selectBox).append($dropdown);

            // Hide original select and add container
            $select.hide().after($container);

            // Set initial state
            updateSelectedItems();
        });
    };

    return $.fn.ioSelect;
})();

export default IOSelect; 