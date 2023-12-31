odoo.define('data_cleaning.ListView', function (require) {
"use strict";

    var ListView = require('web.ListView');
    var viewRegistry = require('web.view_registry');
    var DataCommonListController = require('data_cleaning.CommonListController');

    var DataCleaningListController = DataCommonListController.extend({
        buttons_template: 'DataCleaning.buttons',
        /**
         * @override
         */
        renderButtons: function ($node) {
            this._super.apply(this, arguments);
            this.$buttons.on('click', '.o_data_cleaning_validate_button', this._onValidateClick.bind(this));
            this.$buttons.on('click', '.o_data_cleaning_unselect_button', this._onUnselectClick.bind(this));
        },

        /**
         * Validate all the records selected
         * @param {*} ev
         */
        _onValidateClick: function(ev) {
            const self = this;
            const record_ids = this.getSelectedIds();
            this._rpc({
                model: 'data_cleaning.record',
                method: 'action_validate',
                args: [record_ids],
            }).then(function(data) {
                self.trigger_up('reload');
            });
        },
    });

    var DataCleaningListView = ListView.extend({
        config: _.extend({}, ListView.prototype.config, {
            Controller: DataCleaningListController,
        }),
    });

    viewRegistry.add('data_cleaning_list', DataCleaningListView);
});
