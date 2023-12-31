odoo.define('timesheet_grid.timesheet_pivot_view', function (require) {
    "use strict";
    
    const PivotView = require('web.PivotView');
    const PivotRenderer = require('web.PivotRenderer');
    const QRCodeMixin = require('hr_timesheet.res.config.form');
    const viewRegistry = require('web.view_registry');
    
    const TimesheetPivotRenderer = PivotRenderer.extend(QRCodeMixin.TimesheetConfigQRCodeMixin);
    
    const TimesheetPivotView = PivotView.extend({
        config: _.extend({}, PivotView.prototype.config, {
            Renderer: TimesheetPivotRenderer
        })
    });
    
    viewRegistry.add('timesheet_pivot_view', TimesheetPivotView);
    
    return { TimesheetPivotView, TimesheetPivotRenderer };
    
    });
    