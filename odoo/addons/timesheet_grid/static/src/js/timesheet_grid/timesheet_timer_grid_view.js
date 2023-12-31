odoo.define('timesheet_grid.TimerGridView', function (require) {
    "use strict";

    const viewRegistry = require('web.view_registry');
    const WebGridView = require('web_grid.GridView');
    const TimerGridController = require('timesheet_grid.TimerGridController');
    const TimerGridModel = require('timesheet_grid.TimerGridModel');
    const TimerGridRenderer = require('timesheet_grid.TimerGridRenderer');

    const TimerGridView = WebGridView.extend({
        config: Object.assign({}, WebGridView.prototype.config, {
            Model: TimerGridModel,
            Controller: TimerGridController,
            Renderer: TimerGridRenderer
        })
    });

    viewRegistry.add('timesheet_timer_grid', TimerGridView);

    return TimerGridView;
});
