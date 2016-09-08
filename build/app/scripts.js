'use strict';

Object.defineProperty(exports, "__esModule", {
	value: true
});
exports.test = test;
exports.seedAndUpdateUsers = seedAndUpdateUsers;

var _controllers = require('../bot/controllers');

var _models = require('./models');

var _models2 = _interopRequireDefault(_models);

var _momentTimezone = require('moment-timezone');

var _momentTimezone2 = _interopRequireDefault(_momentTimezone);

var _dotenv = require('dotenv');

var _dotenv2 = _interopRequireDefault(_dotenv);

var _lodash = require('lodash');

var _lodash2 = _interopRequireDefault(_lodash);

var _constants = require('../bot/lib/constants');

var _slackHelpers = require('../bot/lib/slackHelpers');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function test(bot) {

	// U1NCGAETZ slackid of @test
	// U121ZK15J slackid of @kevin
	var SlackUserIds = 'U1NCGAETZ,U121ZK15J';
	bot.api.mpim.open({
		users: SlackUserIds
	}, function (err, response) {
		console.log(response);
		if (!err) {
			var id = response.group.id;

			bot.api.mpim.history({
				channel: id
			}, function (err, response) {

				if (!err) {
					var messages = response.messages;

					console.log('\n\n\n displaying the ' + messages.length + ' messages for this convo');
					console.log(messages[0]);
					var timeStampObject = _momentTimezone2.default.unix(messages[0].ts);
					console.log('\n\n\n timestamp: ' + timeStampObject.format());

					if (messages[0].reactions) {
						console.log(messages[0].reactions);
					}
				}
			});
		}
	});

	// on session_start or session_end...
	// go through all the channels where this BOT is in the channel
	// then find the channels where the user who ended session is ALSO in the channel
	// if both are true, update that message with the user's updated status!

	bot.api.dnd.setSnooze({
		token: "xoxp-36063701207-56424354951-77681914739-74b9d496d0",
		num_minutes: 2
	}, function (err, res) {

		console.log('\n\n\n setting snooze');
		console.log(err);
		console.log(res);
		console.log('\n\n\n\n');
	});

	bot.api.dnd.teamInfo({
		token: "xoxp-36063701207-36067647188-61457777139-37c84dc5c2"
	}, function (err, res) {

		console.log('\n\n\n dnd team info snooze');
		console.log(err);
		console.log(res);
		console.log('\n\n\n\n');
	});

	bot.api.channels.list({}, function (err, response) {

		var BotSlackUserId = bot.identity.id;

		if (!err) {
			var channels = response.channels;


			console.log('\n\n\n there are ' + channels.length + ' channels');

			channels.forEach(function (channel) {
				var id = channel.id;
				var name = channel.name;
				var is_channel = channel.is_channel;
				var topic = channel.topic;
				var purpose = channel.purpose;
				var members = channel.members;


				var hasBotSlackUserId = false;
				var hasMemberSlackUserId = false;

				var KevinSlackUserId = 'U121ZK15J';
				var KevinTeamId = 'T121VLM63';

				_lodash2.default.some(members, function (member) {
					if (member == KevinSlackUserId) {
						hasBotSlackUserId = true;
					} else if (member == BotSlackUserId) {
						hasMemberSlackUserId = true;
					}
				});

				if (hasBotSlackUserId && hasMemberSlackUserId) {

					console.log('\n\n\n channel name: ' + name + ' has both members in slack user');
					console.log(channel);

					(0, _slackHelpers.updateDashboardForChannelId)(bot, id);
				}
			});
		} else {
			console.log('\n\n\n ~~ error in listing channel:');
			console.log(err);
		}
	});

	bot.api.groups.create({
		name: 'kevin-dashboard'
	}, function (err, response) {

		console.log('\n\n\n group created:');
		console.log(response);
	});
} /**
   * 		For fun one-off thingz
   */

function seedAndUpdateUsers(members) {

	members.forEach(function (member) {
		var id = member.id;
		var team_id = member.team_id;
		var name = member.name;
		var tz = member.tz;


		var SlackUserId = id;

		_models2.default.User.find({
			where: { SlackUserId: SlackUserId }
		}).then(function (user) {

			if (user) {

				user.update({
					TeamId: team_id,
					SlackName: name
				});
				if (member.profile && member.profile.email) {
					var email = member.profile.email;

					if (email && user.email == '') {
						user.update({
							email: email
						});
					}
				}
			} else {

				console.log("\n\n ~~ new user and creating ~~ \n\n");
				var _email = '';
				if (member.profile && member.profile.email) _email = member.profile.email;
				_models2.default.User.create({
					SlackUserId: SlackUserId,
					email: _email,
					TeamId: team_id,
					SlackName: name
				});
			}
		});
	});
}
//# sourceMappingURL=scripts.js.map