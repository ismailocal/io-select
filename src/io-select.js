import $ from 'jquery';

const IOSelect = (function () {
    'use strict';

    if (typeof $ === 'undefined') {
        console.error('IO Select requires jQuery');
        return;
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
                        
                        // Remove initialization flag
                        $select.removeData('io-select-initialized');
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
            ajax: null, // An object to hold Ajax settings.
            // ajax.url: '', - The URL for the Ajax request.
            // ajax.type: 'GET', - The HTTP method for the Ajax request.
            // ajax.dataType: 'json', - The expected data type of the response.
            // ajax.delay: 250, - Delay in milliseconds before sending the Ajax request after typing.
            // ajax.data: A function that returns an object of parameters to send with the request (e.g., { term: params.term, page: params.page }). This will allow dynamic parameters.
            // ajax.processResults: A function that processes the Ajax response and returns an array of objects in the format { id: '', name: '' }.
            // ajax.cache: false - Whether to cache ajax results.
        };

        // Merge user settings with defaults
        const tempSettings = $.extend(true, {}, defaults, options); // Deep merge for nested ajax object

        // Initialize ajax settings if ajax options are provided
        if (options && options.ajax) {
            tempSettings.ajax = $.extend({}, {
                url: '',
                type: 'GET',
                dataType: 'json',
                delay: 250,
                data: function (params) {
                    return {
                        term: params.term, // search term
                        page: params.page
                    };
                },
                processResults: function (data) {
                    // Process data here
                    return data; // Example: assuming data is already in { id: '', name: '' } format
                },
                cache: false
            }, options.ajax);
        } else {
            // If options.ajax is not provided, but defaults.ajax was (which is null)
            // ensure settings.ajax is also null.
             tempSettings.ajax = null;
        }
        const settings = tempSettings;

        // Process each select element
        return this.each(function () {
            const $select = $(this);
            let debounceTimeout = null; // For debouncing ajax requests
            let ajaxCache = {}; // For caching ajax results per instance

            // Check if already initialized
            if ($select.data('io-select-initialized')) {
                // If already initialized, destroy first
                $select.ioSelect('destroy');
            }

            // Mark as initialized
            $select.data('io-select-initialized', true);

            const isMultiple = $select.prop('multiple');

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
                    const searchTerm = $(this).val(); // Keep original case for server, convert toLowerCase if filtering client-side

                    clearTimeout(debounceTimeout);

                    if (settings.ajax && settings.ajax.url) {
                        // Note: 'searchTerm' from the outer scope of keyup is available here if needed,
                        // but currentSearchTerm inside setTimeout is preferred for cache key + request.
                        debounceTimeout = setTimeout(function () {
                            const currentSearchTerm = $searchInput.val(); // Get fresh value for cache key and request
                            const requestData = settings.ajax.data({ term: currentSearchTerm, page: 1 }); // Assuming page 1

                            if (settings.ajax.cache) {
                                // Using JSON.stringify on requestData to create a more robust cache key,
                                // especially if requestData contains multiple dynamic parameters.
                                const cacheKey = JSON.stringify(requestData);
                                if (ajaxCache[cacheKey]) {
                                    allOptions = ajaxCache[cacheKey];
                                    filterOptions(''); // Display cached results
                                    return; // Bypass Ajax call
                                }
                            }

                            // Show loading indicator
                            $optionsList.empty().append(
                                $('<li>').addClass('text-sm px-3 py-2 text-gray-500 dark:text-gray-400 cursor-default text-center').text('Loading...')
                            );

                            $.ajax({
                                url: settings.ajax.url,
                                type: settings.ajax.type,
                                dataType: settings.ajax.dataType,
                                data: requestData, // Use the fresh requestData
                                success: function (data) {
                                    const processedResults = settings.ajax.processResults(data);

                                    if (settings.ajax.cache) {
                                        const cacheKey = JSON.stringify(requestData);
                                        ajaxCache[cacheKey] = processedResults; // Cache the processed results
                                    }

                                    allOptions = processedResults;
                                    filterOptions(''); // Display new results
                                },
                                error: function () {
                                    $optionsList.empty().append(
                                        $('<li>').addClass('text-sm px-3 py-2 text-red-500 dark:text-red-400 cursor-default text-center').text('Error loading results.')
                                    );
                                }
                            });
                        }, settings.ajax.delay);
                    } else if (settings.searchable) {
                        filterOptions(searchTerm.toLowerCase()); // searchTerm from keyup's outer scope
                    }
                });
            }

            // Options list
            const $optionsList = $('<ul>').addClass('py-1');
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
            function filterOptions(searchTerm) {
                $optionsList.empty();

                let optionsToDisplay;

                if (settings.ajax && settings.ajax.url) {
                    // When Ajax is active, allOptions has been updated with Ajax results.
                    // The searchTerm passed from ajax success is '', so no further client-side filtering is done by default.
                    // If searchTerm were passed, and client-side filtering of ajax results was desired, it could be done here.
                    optionsToDisplay = allOptions; // These are the processed results from Ajax
                } else {
                    // Standard non-Ajax behavior: filter original allOptions
                    if (searchTerm) {
                        optionsToDisplay = allOptions.filter(item =>
                            item.name.toLowerCase().includes(searchTerm) // searchTerm is already toLowerCase
                        );
                    } else {
                        optionsToDisplay = allOptions; // Show all original options if search term is empty
                    }
                }

                if (optionsToDisplay.length === 0) {
                    const $noResults = $('<li>').addClass(`
                        text-sm px-3 py-2 text-gray-500 dark:text-gray-400
                        cursor-default text-center
                    `).text(settings.noResultsText);
                    $optionsList.append($noResults);
                } else {
                    optionsToDisplay.forEach(item => {
                        const $option = createOptionElement(item);
                        $optionsList.append($option);
                    });
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
                    // When opening dropdown with Ajax, we might want to trigger an initial search or load initial options
                    if (settings.ajax && settings.ajax.url) {
                        // Trigger a search with empty term or some initial query
                        // For now, let's assume $searchInput.val() is used or it's handled by a click/focus event later
                        // $searchInput.trigger('keyup'); // This could trigger a search if needed
                        // Or, display a message like "Type to search"
                        if (!$searchInput.val()) {
                             $optionsList.empty().append(
                                $('<li>').addClass('text-sm px-3 py-2 text-gray-500 dark:text-gray-400 cursor-default text-center').text(settings.searchPlaceholder)
                             );
                        } else {
                            // If there's already text, trigger keyup to perform search and show loading indicator
                            $searchInput.trigger('keyup');
                        }
                    } else if (settings.searchable) {
                        const searchTerm = $searchInput ? $searchInput.val().toLowerCase() : '';
                        filterOptions(searchTerm);
                    } else {
                        filterOptions(''); // Show all if not searchable and not ajax
                    }
                }
            }

            function hideDropdown() {
                $dropdown.addClass('hidden');
                $selectBox.attr('aria-expanded', 'false');
            }

            // Event listeners
            $selectBox.on('click', toggleDropdown);
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