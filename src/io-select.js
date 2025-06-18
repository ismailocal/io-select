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
            ajax: null, // { url: '', method: 'GET', dataKey: 'results', queryParam: 'q' }
            initialSelected: null // { id: '', name: '' } veya [{ id: '', name: '' }]
        };

        // Merge user settings with defaults
        const settings = $.extend({}, defaults, options);

        // Process each select element
        return this.each(function () {
            const $select = $(this);

            // Check if already initialized
            if ($select.data('io-select-initialized')) {
                // If already initialized, destroy first
                $select.ioSelect('destroy');
            }

            // Mark as initialized
            $select.data('io-select-initialized', true);

            const isMultiple = $select.prop('multiple');

            // Get all options
            let allOptions = Array.from($select.find('option')).map(option => ({
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
                const $searchContainer = $('<div>').addClass('p-2 sticky top-0 bg-white dark:bg-gray-700 z-10 border-b');
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

                // Debounce fonksiyonu
                function debounce(func, wait) {
                    let timeout;
                    return function(...args) {
                        clearTimeout(timeout);
                        timeout = setTimeout(() => func.apply(this, args), wait);
                    };
                }

                // Search functionality
                if (settings.ajax && settings.ajax.url) {
                    $searchInput.on('keyup', debounce(function () {
                        const searchTerm = $(this).val().toLowerCase();
                        ajaxFetchOptions(searchTerm);
                    }, 300));
                } else {
                    $searchInput.on('keyup', function () {
                        const searchTerm = $(this).val().toLowerCase();
                        filterOptions(searchTerm);
                    });
                }
            }

            // Options list
            const $optionsList = $('<ul>').addClass('py-1');
            $dropdown.append($optionsList);

            // isLoading state
            let isLoading = false;

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
                let $option = $select.find(`option[value="${itemId}"]`);
                // Eğer option yoksa, AJAX ile gelmiştir, ekle
                if ($option.length === 0) {
                    // allOptions içinden label'ı bul
                    const found = allOptions.find(opt => String(opt.id) === String(itemId));
                    const label = (found && (found.name || found.title)) || itemId;
                    $option = $(`<option>`).val(itemId).text(label);
                    $select.append($option);
                }
                let isSelected = $select.find(`option[value="${itemId}"]`).prop('selected');

                if (isMultiple) {
                    $option.prop('selected', !isSelected);
                } else {
                    if (isSelected) {
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
                // Eğer single select ve AJAX modundaysa, boş option ekle ve seçili yap
                if (!isMultiple && settings.ajax && settings.ajax.url) {
                    let $emptyOption = $select.find('option[value=""]');
                    if ($emptyOption.length === 0) {
                        $emptyOption = $('<option>').val('').text('');
                        $select.prepend($emptyOption);
                    }
                    $select.find('option').prop('selected', false);
                    $emptyOption.prop('selected', true);
                }
                updateSelectedItems();
                // Eğer dropdown açıksa, checkbox'ları güncelle
                if (!$dropdown.hasClass('hidden')) {
                    const searchTerm = settings.searchable && $searchInput ? $searchInput.val().toLowerCase() : '';
                    filterOptions(searchTerm);
                }
            }

            // Filter options
            function filterOptions(searchTerm) {
                $optionsList.empty();

                let filteredOptions;
                if (settings.ajax && settings.ajax.url) {
                    // AJAX modunda filtreleme yapma, tüm allOptions'u göster
                    filteredOptions = allOptions;
                    if (isLoading) {
                        const $loading = $('<li>').addClass('text-sm px-3 py-2 text-gray-500 dark:text-gray-400 cursor-default text-center').text('Yükleniyor...');
                        $optionsList.append($loading);
                        return;
                    }
                    // Eğer veri henüz gelmediyse veya sonuç yoksa, 'Ürün bulunamadı' göster
                    if (filteredOptions.length === 0) {
                        const $noResults = $('<li>').addClass(`
                            text-sm px-3 py-2 text-gray-500 dark:text-gray-400
                            cursor-default text-center
                        `).text(settings.noResultsText);
                        $optionsList.append($noResults);
                        return;
                    }
                } else {
                    filteredOptions = allOptions.filter(item => {
                        const label = item.name || item.title || '';
                        return !searchTerm || label.toLowerCase().includes(searchTerm.toLowerCase());
                    });
                }

                filteredOptions.forEach(item => {
                    const $option = createOptionElement(item);
                    $optionsList.append($option);
                });
            }

            // AJAX ile seçenekleri getir
            function ajaxFetchOptions(searchTerm) {
                const ajaxSettings = settings.ajax;
                const method = ajaxSettings.method || 'GET';
                const dataKey = ajaxSettings.dataKey || 'data';
                const queryParam = ajaxSettings.queryParam || 'q';
                const url = ajaxSettings.url;
                let ajaxData = {};
                ajaxData[queryParam] = searchTerm;
                $optionsList.empty();
                isLoading = true;
                filterOptions(searchTerm);
                $.ajax({
                    url: url,
                    method: method,
                    data: ajaxData,
                    success: function (response) {
                        let results = response;
                        if (dataKey && response[dataKey]) {
                            results = response[dataKey];
                        }
                        // Sonuçları uygun formata çevir
                        allOptions = results.map(item => ({
                            id: item.id,
                            name: item.name || item.title // title varsa onu kullan
                        }));
                        isLoading = false;
                        filterOptions(searchTerm);
                    },
                    error: function () {
                        $optionsList.empty();
                        const $error = $('<li>').addClass('text-sm px-3 py-2 text-red-500 cursor-default text-center').text('Bir hata oluştu');
                        $optionsList.append($error);
                        isLoading = false;
                    }
                });
            }

            // Create option element
            function createOptionElement(item) {
                const safeId = (item.id !== undefined && item.id !== null) ? item.id : '';
                const $option = $('<li>').addClass(`
                    text-sm px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-600
                    cursor-pointer flex items-center
                `).attr({
                    'role': 'option',
                    'aria-selected': 'false',
                    'id': `io-select-option-${$select.attr('id')}-${safeId}`
                });

                let $checkbox = null; // Initialize $checkbox to null
                if (isMultiple) { // Check if isMultiple is true
                    $checkbox = $('<input>').attr({ // Create checkbox only if isMultiple is true
                        type: 'checkbox',
                        class: 'mr-2',
                        'aria-hidden': 'true' // Hide for screen readers, option role is already present
                    });

                    // Check checkbox status
                    let isSelected = $select.find(`option[value="${safeId}"]`).prop('selected');
                    $checkbox.prop('checked', !!isSelected);
                    $option.attr('aria-selected', (!!isSelected).toString());

                    $option.append($checkbox); // Append checkbox only if isMultiple is true
                } else {
                    // For single select, still need to set aria-selected based on the actual select option
                    const isSelected = $select.find(`option[value="${safeId}"]`).prop('selected');
                    $option.attr('aria-selected', (!!isSelected).toString());
                }

                const $text = $('<span>').text(item.name || item.title || '');
                $option.append($text); // Append text regardless of isMultiple

                $option.on('click', function () {
                    toggleItem(safeId);
                    // Update checkbox status only if isMultiple is true
                    if (isMultiple && $checkbox) {
                        const newSelected = $select.find(`option[value="${safeId}"]`).prop('selected');
                        $checkbox.prop('checked', !!newSelected);
                    }
                    // Always update aria-selected for the option itself
                    const newSelectedState = $select.find(`option[value="${safeId}"]`).prop('selected');
                    $option.attr('aria-selected', (!!newSelectedState).toString());
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
                    if (settings.ajax && settings.ajax.url) {
                        // Sadece ilk açılışta veya input boşsa istek at
                        if (!$searchInput.data('ajax-initial-loaded')) {
                            ajaxFetchOptions('');
                            $searchInput.data('ajax-initial-loaded', true);
                        }
                    }
                    filterOptions(searchTerm);
                    // Dropdown açıldığında search input'a focus ol
                    if (settings.searchable && $searchInput) {
                        setTimeout(() => $searchInput.focus(), 0);
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

            // Initial selected işle
            if (settings.initialSelected) {
                if (isMultiple && Array.isArray(settings.initialSelected)) {
                    // Multiple select için array
                    settings.initialSelected.forEach(item => {
                        if (item && item.id) {
                            // Önce mevcut option'da var mı kontrol et
                            let $option = $select.find(`option[value="${item.id}"]`);
                            if ($option.length === 0) {
                                // Yoksa ekle
                                $option = $(`<option>`).val(item.id).text(item.name || item.title || item.id);
                                $select.append($option);
                            }
                            $option.prop('selected', true);
                        }
                    });
                } else if (!isMultiple && settings.initialSelected && settings.initialSelected.id) {
                    // Single select için object
                    const item = settings.initialSelected;
                    let $option = $select.find(`option[value="${item.id}"]`);
                    if ($option.length === 0) {
                        // Yoksa ekle
                        $option = $(`<option>`).val(item.id).text(item.name || item.title || item.id);
                        $select.append($option);
                    }
                    $select.find('option').prop('selected', false);
                    $option.prop('selected', true);
                }
                updateSelectedItems();
            }
        });
    };

    return $.fn.ioSelect;
})();

export default IOSelect; 