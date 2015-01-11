'use strict';

var _ = require('underscore');
var Boom = require('boom');
var Calendar = require('icalendar');
var Moment = require('moment');
var Accepts = require('accepts');
var config = require('./config');
var trans = require('./translate').trans;
var db = require('./db');

exports.handler = calendarHandler;

function calendarHandler(type) {
    return function(request, reply) {
        var params = _.omit(request.query, [ 'sort', 'limit', 'lang' ]);
        if (request.query.lang) {
            trans.setLocale(request.query.lang);
        }
        if (type) {
            params['type'] = type;
        }
        db.calendar(function(err, docs) {
            if (err) {
                console.log('error', err);
                reply();
            }
            contentNegotiation(request, reply, docs);
        }, params, request.query.sort, request.query.limit);
    };
}

function contentNegotiation(request, reply, docs) {
    var validFormats;
    var format;
    var errorMsg;

    if (request.params.format) {
        // format in the URL /api/tramstop.json
        format = request.params.format.trim().slice(1);
        validFormats = [ 'json', 'ics' ];
        errorMsg = 'Client must either use json or ics as format';
    } else {
        // format in Accept header
        var accept = Accepts(request.raw.req);
        validFormats = [ 'application/json', 'text/calendar' ];
        format = accept.types(validFormats);
        errorMsg = 'Client must either accept application/json or text/calendar';
    }

    var icsContentType = 'text/calendar';
    switch (format) {
        case validFormats[0]:
            reply(docs);
            break;
        case validFormats[1]:
            reply(convertToIcal(docs)).header('Content-Type', icsContentType);
            break;
        default:
            reply(Boom.notAcceptable(errorMsg));
    }
}

function convertToIcal(docs) {
    var iCal = new Calendar.iCalendar(true);
    iCal.addProperty('VERSION', '2.0');
    iCal.addProperty('PRODID', '-//metaodi//openerz//EN');
    iCal.addProperty('NAME', 'OpenERZ');
    iCal.addProperty('X-WR-CALNAME', 'OpenERZ');
    iCal.addProperty('DESCRIPTION', trans.translate('Waste collection of the City of Zurich (ERZ)'));
    iCal.addProperty('X-WR-CALDESC', trans.translate('Waste collection of the City of Zurich (ERZ)'));
    iCal.addProperty('TIMEZONE-ID', 'Europe/Zurich');
    iCal.addProperty('TZID', 'Europe/Zurich');
    iCal.addProperty('X-WR-TIMEZONE', 'Europe/Zurich');

    var calInfo = config.calendar();
    var vEvent, momDate;
    _.each(docs, function(doc) {
        vEvent = iCal.addComponent('VEVENT');
        vEvent.setSummary(trans.translate(calInfo[doc.type].name) + ', ' + trans.translate('ZIP: $[1]', doc.zip));
        if (doc.station && doc.type.indexOf('tram') >= 0) {
            vEvent.setLocation(trans.translate('Tram stop') + ': ' + doc.station);
        } else if (doc.station) {
            vEvent.setLocation(trans.translate('Station') + ': ' + doc.station);
        } else {
            vEvent.setLocation(trans.translate('ZIP: $[1]', doc.zip));
        }
        vEvent.setDescription(trans.translate(calInfo[doc.type].description));

        momDate = Moment(doc.date);
        vEvent.addProperty('DTSTART', momDate.toDate(), { VALUE: 'DATE' });
        vEvent.addProperty('DTEND', momDate.clone().add(1, 'days').toDate(), { VALUE: 'DATE' });
    });

    return iCal.toString();
}