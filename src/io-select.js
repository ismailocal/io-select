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
            virtualScrollBuffer: 5,  // Number of options to render above/below visible area
            ajax: {
                url: null,
                method: 'GET',
                dataType: 'json',
                delay: 300,
                data: function(params) {
                    // Remove undefined params to keep URL clean
                    let query = {};
                    if (params.term) query.term = params.term;
                    if (params.page) query.page = params.page; // For pagination
                    return query;
                },
                processResults: function(data, params) {
                    // Assumes data is an array of {id: '', name: ''} objects
                    // Or an object like { items: [], total_count: X } for pagination
                    // For basic cases, if data is an array, just return it.
                    // For more complex server responses, user MUST override this.
                    if (Array.isArray(data)) {
                        return { results: data }; // No pagination assumed
                    } else if (data && Array.isArray(data.results)) {
                        // Expects {results: [], pagination: {more: boolean}}
                        return data;
                    }
                    return { results: [] }; // Default fallback
                },
                triggerMinSearchTermLength: 1,
                pageParam: 'page', // Parameter name for page number if pagination is used
                initialValueUrl: null // URL to fetch display text for pre-selected values by ID
            }
        };

        // Merge user settings with defaults - true for deep merge
        const settings = $.extend(true, {}, defaults, options);

        // Process each select element
        return this.each(function () {
            const $select = $(this);
            const isMultiple = $select.prop('multiple');

            const isAjaxMode = settings.ajax && settings.ajax.url ? true : false;
            let ajaxCurrentPage = 1;
            let ajaxIsLoading = false;
            let ajaxCurrentSearchTerm = '';
            let ajaxHasMorePages = true; // Assume more pages until told otherwise
            let ajaxDebounceTimeout = null; // For debouncing search input

            let allOptions = []; // Initialize as empty
            if (isAjaxMode) {
                // In AJAX mode, allOptions will be populated by AJAX responses.
                // Pre-selected options text may need to be handled by initialValueUrl or if data is in the <select>
                $select.find('option:selected').each(function() {
                    const val = $(this).val();
                    const text = $(this).text();
                    if (val) { // only add if value is not empty
                        // Note: 'selected: true' is implicit as we are iterating :selected
                        // but we can add it if it helps other parts of the logic distinguish these.
                        allOptions.push({ id: val, name: text, selected: true });
                    }
                });
            } else {
                // Original logic for non-AJAX mode
                allOptions = Array.from($select.find('option')).map(option => ({
                    id: option.value,
                    name: option.text
                })).filter(option => option.id !== ''); // Filter empty option
            }

            let currentFilteredOptions = [...allOptions]; // Holds the currently filtered list of options, start with pre-selected AJAX items

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
                    if (isAjaxMode) {
                        const currentSearchVal = $(this).val(); // Keep original case for server
                        clearTimeout(ajaxDebounceTimeout);

                        if (currentSearchVal.length === 0 && settings.ajax.triggerMinSearchTermLength === 0) {
                            ajaxDebounceTimeout = setTimeout(() => {
                                fetchAjaxOptions('', 1, true);
                            }, settings.ajax.delay);
                        } else if (currentSearchVal.length >= settings.ajax.triggerMinSearchTermLength) {
                            ajaxDebounceTimeout = setTimeout(() => {
                                fetchAjaxOptions(currentSearchVal, 1, true);
                            }, settings.ajax.delay);
                        } else {
                            // Term is too short, or cleared and minLength > 0
                            currentFilteredOptions = [];
                            // allOptions = []; // Don't clear allOptions if it holds pre-selected resolved items
                            if (settings.virtualScroll && $optionsSizer) {
                                $optionsSizer.height(0);
                                renderVisibleOptions(); // Will show 'no results' or empty
                            } else if (!settings.virtualScroll) {
                                renderAllOptions(); // Will show 'no results' or empty
                            }
                            clearAjaxError();
                        }
                    } else {
                        const searchTerm = $(this).val().toLowerCase();
                        filterOptions(searchTerm);
                    }
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
                if (itemId === '' || typeof itemId === 'undefined') return; // Don't process empty or undefined itemId

                let optionData = null;
                if (isAjaxMode) {
                    // Find by comparing string versions of IDs, as item.id could be number and itemId string or vice-versa
                    optionData = currentFilteredOptions.find(opt => opt.id.toString() == itemId.toString());
                }

                let $nativeOption = $select.find(`option[value="${itemId}"]`);

                // If the option doesn't exist in the native select (common for AJAX-loaded items)
                // and we are trying to select it (i.e., it's not currently selected or doesn't exist to be selected)
                // or if it's for multiple select where we always toggle.
                // For single select, if it's a new item, we are effectively selecting it.
                if (!$nativeOption.length) {
                    if (itemId) { // Ensure itemId is valid before creating an option
                        const optionText = optionData && optionData.name ? optionData.name : itemId.toString();
                        $nativeOption = $('<option>').val(itemId).text(optionText);
                        $select.append($nativeOption);

                        // If this new option was sourced from currentFilteredOptions (AJAX),
                        // ensure it's also in allOptions so getSelectedItems can find its text.
                        // This might be slightly redundant if fetchAjaxOptions already syncs allOptions,
                        // but good for robustness.
                        if (optionData && !allOptions.some(opt => opt.id.toString() == itemId.toString())) {
                            allOptions.push(optionData);
                        }
                    } else {
                        return; // Cannot toggle an invalid itemId if option doesn't exist
                    }
                }

                const isCurrentlySelected = $nativeOption.prop('selected');

                if (isMultiple) {
                    $nativeOption.prop('selected', !isCurrentlySelected);
                } else {
                    if (isCurrentlySelected) {
                        // For single-select, if de-selecting, select the placeholder if one exists.
                        $select.find('option').prop('selected', false);
                        // Attempt to select an empty value option if available (common placeholder pattern)
                        const $emptyOption = $select.find('option[value=""]');
                        if ($emptyOption.length) {
                            $emptyOption.prop('selected', true);
                        }
                    } else {
                        // Make new selection (deselect all others, then select the current one)
                        $select.find('option').prop('selected', false);
                        $nativeOption.prop('selected', true);
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

            // AJAX specific helper functions
            function showAjaxLoadingIndicator() {
                if (!isAjaxMode) return;
                $container.addClass('io-select-loading'); // Add class to main container
                 // Optionally, add a spinner or loading text to $optionsList or $dropdown
                if ($optionsList.find('.io-select-loader-message').length === 0) {
                    const $loaderMsg = $('<li>').addClass('io-select-loader-message text-sm px-3 py-2 text-gray-500 dark:text-gray-400 text-center').text('Loading...');
                    if (settings.virtualScroll && $optionsSizer) {
                         // For virtual scroll, ensure it's visible and not part of sizer
                        $loaderMsg.css({position: 'relative'}); // Not absolute like options
                         $optionsList.append($loaderMsg);
                    } else {
                        $optionsList.prepend($loaderMsg); // Or append, depending on desired position
                    }
                }

            }

            function hideAjaxLoadingIndicator() {
                if (!isAjaxMode) return;
                $container.removeClass('io-select-loading');
                $optionsList.find('.io-select-loader-message').remove();
            }

            function showAjaxError(message) {
                if (!isAjaxMode) return;
                clearAjaxError(); // Clear previous errors
                const $errorMsg = $('<li>').addClass('io-select-error-message text-sm px-3 py-2 text-red-500 dark:text-red-400 text-center').text(message);
                 if (settings.virtualScroll && $optionsSizer) {
                    $errorMsg.css({position: 'relative'});
                    $optionsList.append($errorMsg);
                } else {
                    $optionsList.prepend($errorMsg);
                }
            }

            function clearAjaxError() {
                if (!isAjaxMode) return;
                $optionsList.find('.io-select-error-message').remove();
            }

            function fetchAjaxOptions(searchTerm, pageNumber, isNewSearch) {
                if (!isAjaxMode || ajaxIsLoading) {
                    return;
                }
                ajaxIsLoading = true;
                ajaxCurrentSearchTerm = searchTerm; // Store the term for this request
                if (isNewSearch) {
                    ajaxCurrentPage = 1;
                    ajaxHasMorePages = true; // Reset for new search
                } else {
                    ajaxCurrentPage = pageNumber;
                }

                showAjaxLoadingIndicator();
                clearAjaxError();

                const requestData = settings.ajax.data.call(null, { term: searchTerm, page: ajaxCurrentPage });

                $.ajax({
                    url: settings.ajax.url,
                    method: settings.ajax.method || 'GET',
                    dataType: settings.ajax.dataType || 'json',
                    data: requestData,
                    success: function(response) {
                        const processed = settings.ajax.processResults.call(null, response, { term: searchTerm, page: ajaxCurrentPage });
                        const newResults = processed.results || [];
                        ajaxHasMorePages = processed.pagination && processed.pagination.more ? true : false;

                        if (isNewSearch) {
                            currentFilteredOptions = newResults;
                            if (settings.virtualScroll && $optionsSizer) {
                                $dropdown.scrollTop(0); // Reset scroll for new results
                            }
                        } else {
                            // Filter out duplicates that might come from server pagination if items can overlap
                            const existingIds = new Set(currentFilteredOptions.map(opt => opt.id.toString()));
                            const uniqueNewResults = newResults.filter(opt => !existingIds.has(opt.id.toString()));
                            currentFilteredOptions = currentFilteredOptions.concat(uniqueNewResults);
                        }

                        // Update allOptions to reflect the latest set from AJAX.
                        // This line ensures that if we select an item from AJAX results, it's "known".
                        // For a pure AJAX setup where options are not kept client-side beyond display, this might be handled differently.
                        // For now, this ensures `getSelectedItems` can find names for selected AJAX items.
                        newResults.forEach(item => {
                            const existingIndex = allOptions.findIndex(opt => opt.id === item.id);
                            if (existingIndex > -1) {
                                allOptions[existingIndex] = item;
                            } else {
                                allOptions.push(item);
                            }
                        });


                        if (settings.virtualScroll && $optionsSizer) {
                            $optionsSizer.height(currentFilteredOptions.length * settings.optionHeight);
                            renderVisibleOptions();
                        } else {
                            renderAllOptions();
                        }

                        if (currentFilteredOptions.length === 0 && searchTerm && !ajaxHasMorePages) {
                             // This is handled by renderVisibleOptions/renderAllOptions which show settings.noResultsText
                        } else if (currentFilteredOptions.length === 0 && !searchTerm && !ajaxHasMorePages) {
                            // Optionally show a different message like "Type to search" or use noResultsText
                             if (settings.virtualScroll && $optionsSizer) renderVisibleOptions(); else renderAllOptions();
                        }

                    },
                    error: function(jqXHR, textStatus, errorThrown) {
                        showAjaxError('Error: ' + (jqXHR.responseJSON && jqXHR.responseJSON.message || errorThrown || textStatus));
                        currentFilteredOptions = [];
                        ajaxHasMorePages = false;
                        // Consider not wiping allOptions here, it might contain resolved pre-selected items.
                        // allOptions = [];
                        if (settings.virtualScroll && $optionsSizer) {
                             $optionsSizer.height(0); renderVisibleOptions();
                        } else {
                            renderAllOptions();
                        }
                    },
                    complete: function() {
                        ajaxIsLoading = false;
                        hideAjaxLoadingIndicator();
                    }
                });
            }


            // Filter options (Primarily for non-AJAX mode now)
            function filterOptions(searchTerm) {
                // This function is primarily for non-AJAX mode or for client-side filtering
                // if settings.ajax.clientSideFilter is ever implemented.
                // For current AJAX mode, server does filtering, and fetchAjaxOptions directly calls rendering.
                if (isAjaxMode && !(settings.ajax && settings.ajax.clientSideFilter)) {
                    // If AJAX mode and no client-side filter, just render current options.
                    // This might be called if dropdown is re-opened and has existing AJAX items.
                    if (settings.virtualScroll && $optionsSizer) {
                        $optionsSizer.height(currentFilteredOptions.length * settings.optionHeight);
                        renderVisibleOptions();
                    } else {
                        renderAllOptions();
                    }
                    return;
                }

                // Non-AJAX filtering or Client-side filtering for AJAX results:
                const newFilteredOptions = allOptions.filter(item =>
                    !searchTerm || item.name.toLowerCase().includes(searchTerm.toLowerCase())
                );
                currentFilteredOptions = newFilteredOptions;

                if (settings.virtualScroll && $optionsSizer) {
                    $optionsSizer.height(currentFilteredOptions.length * settings.optionHeight);
                    $dropdown.scrollTop(0);
                    renderVisibleOptions();
                } else {
                    renderAllOptions();
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

                if (!isExpanded) { // Dropdown is opening
                    if (isAjaxMode) {
                        clearAjaxError();
                        // If min search length is 0, and no search term, and list is empty (or first time)
                        // then fetch initial results.
                        // The check for currentFilteredOptions.length === 0 might be too simple if we allow clearing search to show initial list.
                        // A flag like `ajaxInitialLoadDone` might be better. For now, this is a basic initial load.
                        const currentSearchVal = settings.searchable && $searchInput ? $searchInput.val() : '';
                        if (settings.ajax.triggerMinSearchTermLength === 0 && currentSearchVal.length === 0 && currentFilteredOptions.length === 0) {
                             // Only fetch if truly empty and no search term typed yet, and min length is 0
                            fetchAjaxOptions('', 1, true);
                        } else if (currentFilteredOptions.length > 0) {
                            // If there are already options (e.g. from a previous search or pre-filled), just render them.
                            if (settings.virtualScroll && $optionsSizer) {
                                // Ensure sizer is correct for current items if list was manipulated
                                $optionsSizer.height(currentFilteredOptions.length * settings.optionHeight);
                                renderVisibleOptions();
                            } else {
                                renderAllOptions();
                            }
                        } else if (settings.ajax.triggerMinSearchTermLength > 0 && currentFilteredOptions.length === 0 && !ajaxIsLoading){
                            // If min search length > 0 and list is empty, show "no results" or "type to search"
                            // This is typically handled by render functions when currentFilteredOptions is empty
                             if (settings.virtualScroll && $optionsSizer) renderVisibleOptions(); else renderAllOptions();
                        }
                        // If search input has text satisfying minLength, search will be triggered by keyup if user types.
                        // Or, if we want to trigger search on open if text is present:
                        // else if (currentSearchVal.length >= settings.ajax.triggerMinSearchTermLength) {
                        //    fetchAjaxOptions(currentSearchVal, 1, true);
                        // }
                    } else {
                        const searchTerm = settings.searchable && $searchInput ? $searchInput.val().toLowerCase() : '';
                        filterOptions(searchTerm); // Non-AJAX mode: filter existing options
                    }
                }
            }

            function hideDropdown() {
                $dropdown.addClass('hidden');
                $selectBox.attr('aria-expanded', 'false');
            }

            // Event listeners
            $selectBox.on('click', toggleDropdown);

            if (settings.virtualScroll) {
                // Debounced function for rendering options during virtual scroll
                const debouncedVirtualRender = debounce(function() {
                    renderVisibleOptions();
                    // AJAX Pagination check, integrated into the debounced render for virtual scroll
                    if (isAjaxMode && !ajaxIsLoading && ajaxHasMorePages) {
                        const threshold = 1.5 * settings.optionHeight;
                        if ($dropdown[0].scrollHeight > $dropdown.innerHeight() &&
                            $dropdown.scrollTop() + $dropdown.innerHeight() >= $dropdown[0].scrollHeight - threshold) {
                            ajaxCurrentPage++;
                            fetchAjaxOptions(ajaxCurrentSearchTerm, ajaxCurrentPage, false);
                        }
                    }
                }, 50);
                $dropdown.on('scroll.io-select-virtual', debouncedVirtualRender);
            } else if (isAjaxMode) {
                // If not virtual scrolling, but AJAX mode is on, we still need a scroll listener for pagination
                $dropdown.on('scroll.io-select-ajax-pagination', function() {
                    if (!ajaxIsLoading && ajaxHasMorePages) {
                        const threshold = 1.5 * settings.optionHeight;
                         // Check if scrollHeight is meaningful
                        if ($dropdown[0].scrollHeight > $dropdown.innerHeight() &&
                            $dropdown.scrollTop() + $dropdown.innerHeight() >= $dropdown[0].scrollHeight - threshold) {
                            ajaxCurrentPage++;
                            fetchAjaxOptions(ajaxCurrentSearchTerm, ajaxCurrentPage, false);
                        }
                    }
                });
            }
            // For non-AJAX, non-virtual scroll, no specific scroll listener on $dropdown is needed from here.

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

            // Initial value resolution via AJAX if configured
            if (isAjaxMode && typeof settings.ajax.initialValueUrl === 'string' && settings.ajax.initialValueUrl.trim() !== '') {
                const selectedValues = $select.find('option:selected').map(function() { return $(this).val(); }).get();
                const idsToResolve = selectedValues.filter(id => {
                    return id && id.trim() !== '' && !allOptions.some(opt => opt.id === id && opt.name && opt.name.trim() !== '');
                });

                if (idsToResolve.length > 0) {
                    // Determine data format based on method
                    let ajaxData;
                    const ajaxMethod = (settings.ajax.method || 'GET').toUpperCase();
                    if (ajaxMethod === 'GET' || ajaxMethod === 'DELETE') { // Methods typically using query params
                        ajaxData = { ids: idsToResolve.join(',') };
                    } else { // POST, PUT - typically send data as object/JSON
                        ajaxData = { ids: idsToResolve };
                    }

                    // ajaxIsLoading = true; // Consider adding a loading state for this specific call
                    $.ajax({
                        url: settings.ajax.initialValueUrl,
                        method: ajaxMethod,
                        dataType: settings.ajax.dataType || 'json',
                        data: ajaxData,
                        success: function(response) {
                            const processed = settings.ajax.processResults.call(null, response, { ids: idsToResolve });
                            const resolvedItems = processed.results || [];

                            resolvedItems.forEach(item => {
                                if (!item.id) return; // Skip items without an ID from server
                                const existingOptionIndex = allOptions.findIndex(opt => opt.id === item.id.toString());
                                if (existingOptionIndex > -1) {
                                    allOptions[existingOptionIndex] = { ...allOptions[existingOptionIndex], ...item, selected: true, name: item.name || allOptions[existingOptionIndex].name };
                                } else {
                                    // Only add if it was indeed one of the ids we tried to resolve,
                                    // and it's not already effectively present (e.g. from original <select>)
                                    if (idsToResolve.includes(item.id.toString())) {
                                       allOptions.push({ ...item, id: item.id.toString(), selected: true });
                                    }
                                }
                            });

                            currentFilteredOptions = [...allOptions];
                            updateSelectedItems(); // Update display with newly fetched text
                        },
                        error: function() {
                            // console.error('IO Select: Failed to fetch initial values from initialValueUrl.');
                            // updateSelectedItems(); // Still update, even if fetch failed, to show what we have
                        },
                        complete: function() {
                            // ajaxIsLoading = false;
                        }
                    });
                } else {
                    // No IDs to resolve, or all already have text. Ensure initial display is correct.
                    updateSelectedItems();
                }
            } else {
                 // Set initial state for non-AJAX or no initialValueUrl
                updateSelectedItems();
            }
        });
    };

    return $.fn.ioSelect;
})();

export default IOSelect; 