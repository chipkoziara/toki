'use strict';

Object.defineProperty(exports, "__esModule", {
	value: true
});

exports.default = function (controller) {

	controller.hears(['settings'], 'direct_message', _index.wit.hears, function (bot, message) {

		var SlackUserId = message.user;

		var config = { SlackUserId: SlackUserId };
		controller.trigger('begin_settings_flow', [bot, config]);
	});

	/**
  *      SETTINGS FLOW
  */

	controller.on('begin_settings_flow', function (bot, config) {
		var SlackUserId = config.SlackUserId;


		_models2.default.User.find({
			where: ['"SlackUser"."SlackUserId" = ?', SlackUserId],
			include: [_models2.default.SlackUser]
		}).then(function (user) {
			var nickName = user.nickName;
			var tz = user.SlackUser.tz;

			var userTimeZone = {};
			for (var key in _constants.timeZones) {
				if (_constants.timeZones[key].tz == tz) {
					userTimeZone = _constants.timeZones[key];
				}
			}

			bot.startPrivateConversation({ user: SlackUserId }, function (err, convo) {

				var name = user.nickName || user.email;
				convo.name = name;

				convo.settings = {
					SlackUserId: SlackUserId,
					timeZone: userTimeZone,
					nickName: name
				};

				startSettingsConversation(err, convo);

				convo.on('end', function (convo) {

					(0, _miscHelpers.consoleLog)("end of settings for user!!!!", convo.settings);

					var _convo$settings = convo.settings;
					var SlackUserId = _convo$settings.SlackUserId;
					var nickName = _convo$settings.nickName;
					var timeZone = _convo$settings.timeZone;


					if (timeZone) {
						var _tz = timeZone.tz;


						user.SlackUser.update({
							tz: _tz
						});
					}

					if (nickName) {

						user.update({
							nickName: nickName
						});
					}
				});
			});
		});
	});
};

var _os = require('os');

var _os2 = _interopRequireDefault(_os);

var _index = require('../index');

var _http = require('http');

var _http2 = _interopRequireDefault(_http);

var _bodyParser = require('body-parser');

var _bodyParser2 = _interopRequireDefault(_bodyParser);

var _momentTimezone = require('moment-timezone');

var _momentTimezone2 = _interopRequireDefault(_momentTimezone);

var _models = require('../../../app/models');

var _models2 = _interopRequireDefault(_models);

var _botResponses = require('../../lib/botResponses');

var _constants = require('../../lib/constants');

var _messageHelpers = require('../../lib/messageHelpers');

var _miscHelpers = require('../../lib/miscHelpers');

var _intents = require('../../lib/intents');

var _intents2 = _interopRequireDefault(_intents);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function startSettingsConversation(err, convo) {
	var settings = convo.settings;
	var _convo$settings2 = convo.settings;
	var timeZone = _convo$settings2.timeZone;
	var nickName = _convo$settings2.nickName;


	var settingsAttachment = getSettingsAttachment(settings);
	convo.ask({
		text: 'Hello ' + nickName + '! Here are your settings:',
		attachments: settingsAttachment
	}, [{
		pattern: _constants.buttonValues.changeName.value,
		callback: function callback(response, convo) {
			convo.say("u want to change name");
			convo.next();
		}
	}, { // same as buttonValues.changeName.value
		pattern: _botResponses.utterances.containsName,
		callback: function callback(response, convo) {
			convo.say("u want to change name");
			convo.next();
		}
	}, {
		pattern: _constants.buttonValues.changeTimeZone.value,
		callback: function callback(response, convo) {
			convo.say("u want to change timezone");
			convo.next();
		}
	}, { // same as buttonValues.changeTimeZone.value
		pattern: _botResponses.utterances.containsTimeZone,
		callback: function callback(response, convo) {
			convo.say("u want to change timezone");
			convo.next();
		}
	}, {
		default: true,
		callback: function callback(response, convo) {
			// for now this will be where "never mind" goes
			convo.say("you said never mind");
			convo.next();
		}
	}]);
}

/**
 * use this to generate the attachment of user's current settings
 * @param  {User} user user obj. w/ SlackUser attached to it
 * @return {array}      array that is the slack message attachment
 */


// user wants to update settings!
function getSettingsAttachment(settings) {
	var timeZone = settings.timeZone;
	var nickName = settings.nickName;


	var attachment = [{

		fallback: 'Here are your settings',
		color: _constants.colorsHash.grey.hex,
		attachment_type: 'default',
		fields: [{
			title: 'Name:',
			short: true
		}, {
			value: nickName,
			short: true
		}, {
			title: 'Timezone:',
			short: true
		}, {
			value: timeZone.tz,
			short: true
		}],
		actions: [{
			name: _constants.buttonValues.changeName.name,
			text: "Change name",
			value: _constants.buttonValues.changeName.value,
			type: "button"
		}, {
			name: _constants.buttonValues.changeTimeZone.name,
			text: "Switch Timezone",
			value: _constants.buttonValues.changeTimeZone.value,
			type: "button"
		}, {
			name: _constants.buttonValues.neverMind.name,
			text: "Good for now!",
			value: _constants.buttonValues.neverMind.value,
			type: "button"
		}]
	}];

	return attachment;
}
//# sourceMappingURL=index.js.map