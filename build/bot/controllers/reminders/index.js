'use strict';

Object.defineProperty(exports, "__esModule", {
	value: true
});

exports.default = function (controller) {

	// get reminder
	// if user did not specify reminder, then go through conversational flow about it
	controller.hears(['custom_reminder'], 'direct_message', _index.wit.hears, function (bot, message) {

		// these are array of objects
		var _message$intentObject = message.intentObject.entities;
		var reminder = _message$intentObject.reminder;
		var reminder_text = _message$intentObject.reminder_text;
		var reminder_time = _message$intentObject.reminder_time;
		var reminder_duration = _message$intentObject.reminder_duration;
		var custom_time = _message$intentObject.custom_time;
		var duration = _message$intentObject.duration;

		var SlackUserId = message.user;

		var config = {
			reminder: reminder,
			reminder_text: reminder_text,
			reminder_time: reminder_time,
			reminder_duration: reminder_duration,
			custom_time: custom_time,
			duration: duration,
			SlackUserId: SlackUserId
		};

		// if reminder without a specific time, set to `wants_reminder`
		if (!reminder_duration && !reminder_time && !custom_time && !duration) {
			console.log("about to ask for reminder...");
			console.log(config);
			controller.trigger('ask_for_reminder', [bot, config]);
			return;
		} else {
			// user has already specified time
			controller.trigger('set_reminder', [bot, config]);
		}
	});

	// this is conversational flow to get reminder set
	controller.on('ask_for_reminder', function (bot, config) {
		var SlackUserId = config.SlackUserId;


		if (!SlackUserId) {
			console.log("NOT WORKING IN ask_for_reminder...");
			console.log(config);
			console.log("\n\n\n\n\n");
			return;
		}

		bot.startPrivateConversation({ user: SlackUserId }, function (err, convo) {

			convo.reminderConfig = {
				SlackUserId: SlackUserId
			};

			convo.say("When would you like me to check in with you? :bellhop_bell: ");
			convo.say("I can check in at a specific time, like `2:35pm`");
			convo.ask("I can also check in a certain number of minutes or hours from now, like `40 minutes` or `1 hour`", function (response, convo) {

				// need some way to have a global quit functionality
				if (response.text == "quit" | response.text == "cancel") {
					return;
				}

				var entities = response.intentObject.entities;
				var reminder = entities.reminder;
				var reminder_text = entities.reminder_text;
				var reminder_time = entities.reminder_time;
				var reminder_duration = entities.reminder_duration;
				var duration = entities.duration;
				var custom_time = entities.custom_time;


				console.log("huhh");
				console.log("response:");
				console.log(response);

				console.log("\n\n\n");
				console.log(JSON.stringify(response));

				// if user enters duration
				if (reminder_duration) {
					convo.reminderConfig.reminder_duration = reminder_duration;
				} else if (duration) {
					convo.reminderConfig.reminder_duration = duration;
				}

				// if user enters a time
				if (reminder_time) {
					convo.reminderConfig.reminder_time = reminder_time;
				} else if (custom_time) {
					convo.reminderConfig.reminder_time = custom_time;
				}

				convo.say("Excellent! Would you like me to remind you about anything when I check in?");
				convo.ask("You can leave any kind of one-line note, like `call Kevin` or `follow up with Taylor about design feedback`", [{
					pattern: bot.utterances.yes,
					callback: function callback(response, convo) {
						convo.ask('What note would you like me to remind you about?', function (response, convo) {
							console.log("RESPONSE TEXTT");
							console.log(response);
							console.log("\n\n\n\n\n");
							convo.reminderConfig.reminder_text = [{ value: response.text }];
							convo.next();
						});
						convo.next();
					}
				}, {
					pattern: bot.utterances.no,
					callback: function callback(response, convo) {
						convo.next();
					}
				}, {
					default: true,
					callback: function callback(response, convo) {
						console.log("RESPONSE TEXTT");
						console.log(response);
						console.log("\n\n\n\n\n");
						convo.reminderConfig.reminder_text = [{ value: response.text }];
						convo.next();
					}
				}]);
				convo.next();
			});
			convo.on('end', function (convo) {
				var config = convo.reminderConfig;
				console.log("CONFIG ON FINISH:");
				console.log(config);
				console.log("\n\n\n\n\n");
				controller.trigger('set_reminder', [bot, config]);
			});
		});
	});

	// the actual setting of reminder
	controller.on('set_reminder', function (bot, config) {
		var SlackUserId = config.SlackUserId;
		var reminder = config.reminder;
		var reminder_text = config.reminder_text;
		var reminder_time = config.reminder_time;
		var reminder_duration = config.reminder_duration;
		var custom_time = config.custom_time;
		var duration = config.duration;


		var now = (0, _moment2.default)();

		// get custom note
		var customNote = null;
		if (reminder_text) {
			customNote = reminder_text[0].value;
		} else if (reminder) {
			customNote = reminder[0].value;
		}

		var remindTimeStamp; // for the message (`h:mm a`)
		var remindTimeStampForDB; // for DB (`YYYY-MM-DD HH:mm:ss`)
		if (reminder_duration || duration) {
			// i.e. ten more minutes
			console.log("inside of reminder_duration\n\n\n\n");
			var reminderDuration = reminder_duration ? reminder_duration : duration;
			var durationSeconds = 0;
			for (var i = 0; i < reminderDuration.length; i++) {
				durationSeconds += reminderDuration[i].normalized.value;
			}
			var durationMinutes = Math.floor(durationSeconds / 60);

			remindTimeStamp = now.add(durationSeconds, 'seconds');
		} else if (reminder_time || custom_time) {
			// i.e. `at 3pm`
			console.log("inside of reminder_time\n\n\n\n");
			remindTimeStamp = reminder_time ? reminder_time[0].value : custom_time[0].value;
			remindTimeStamp = (0, _moment2.default)(remindTimeStamp); // in PST because of Wit default settings

			remindTimeStamp.add(remindTimeStamp._tzm - now.utcOffset(), 'minutes'); // convert from PST to local TZ
		}

		if (remindTimeStamp) {
			// insert into DB and send message
			remindTimeStampForDB = remindTimeStamp.format('YYYY-MM-DD HH:mm:ss');
			remindTimeStamp = remindTimeStamp.format('h:mm a');

			// find user then reply
			_models2.default.SlackUser.find({
				where: { SlackUserId: SlackUserId }
			}).then(function (slackUser) {
				_models2.default.Reminder.create({
					remindTime: remindTimeStampForDB,
					UserId: slackUser.UserId,
					customNote: customNote
				}).then(function (reminder) {
					bot.startPrivateConversation({ user: SlackUserId }, function (err, convo) {
						convo.say('Okay, :alarm_clock: set. See you at ' + remindTimeStamp + '!');
						convo.next();
					});
				});
			});
		} else {

			/**
    * 			TERRIBLE CODE BELOW
    * 				THIS MEANS A BUG HAPPENED
    * 	~~	HOPEFULLY THIS NEVER COMES UP EVER ~~
    */

			// this means bug happened
			// hopefully this never comes up
			bot.startPrivateConversation({ user: SlackUserId }, function (err, convo) {
				convo.ask("Sorry, still learning :dog:. Please let me know the time that you want a reminder `i.e. 4:51pm`", function (response, convo) {
					var entities = response.intentObject.entities;
					var reminder = entities.reminder;
					var reminder_text = entities.reminder_text;
					var reminder_time = entities.reminder_time;
					var reminder_duration = entities.reminder_duration;
					var duration = entities.duration;
					var custom_time = entities.custom_time;


					var remindTime = '';
					// if user enters a time
					if (reminder_time) {
						remindTime = reminder_time;
					} else if (custom_time) {
						remindTime = custom_time;
					}

					remindTimeStamp = remindTime[0].value;
					remindTimeStamp = (0, _moment2.default)(remindTimeStamp); // in PST because of Wit default settings

					remindTimeStamp.add(remindTimeStamp._tzm - now.utcOffset(), 'minutes'); // convert from PST to local TZ
					// insert into DB and send message
					remindTimeStampForDB = remindTimeStamp.format('YYYY-MM-DD HH:mm:ss');
					remindTimeStamp = remindTimeStamp.format('h:mm a');

					// find user then reply
					_models2.default.SlackUser.find({
						where: { SlackUserId: SlackUserId }
					}).then(function (slackUser) {
						_models2.default.Reminder.create({
							remindTime: remindTimeStampForDB,
							UserId: slackUser.UserId,
							customNote: customNote
						}).then(function (reminder) {
							bot.startPrivateConversation({ user: SlackUserId }, function (err, convo) {
								convo.say('Okay, :alarm_clock: set. See you at ' + remindTimeStamp + '!');
								convo.next();
							});
						});
					});
				});
			});
		}
	});
};

var _os = require('os');

var _os2 = _interopRequireDefault(_os);

var _index = require('../index');

var _moment = require('moment');

var _moment2 = _interopRequireDefault(_moment);

var _models = require('../../../app/models');

var _models2 = _interopRequireDefault(_models);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }
//# sourceMappingURL=index.js.map