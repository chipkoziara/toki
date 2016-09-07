import os from 'os';
import { wit, bots } from '../index';
import moment from 'moment-timezone';
import _ from 'lodash';

import models from '../../../app/models';
import { isJsonObject } from '../../middleware/hearsMiddleware';
import { utterances, colorsArray, constants, buttonValues, colorsHash, timeZones } from '../../lib/constants';
import { witTimeResponseToTimeZoneObject, convertMinutesToHoursString, getUniqueSlackUsersFromString, getStartSessionOptionsAttachment, commaSeparateOutStringArray } from '../../lib/messageHelpers';
import { notInSessionWouldYouLikeToStartOne } from '../sessions';
import { updateDashboardForChannelId } from '../../lib/slackHelpers';

import dotenv from 'dotenv';

/**
 * 		Sometimes there is a need for just NL functionality not related
 * 		to Wit and Wit intents. Put those instances here, since they will
 * 		show up before Wit gets a chance to pick them up first.
 */

export default function(controller) {

	controller.on(`user_channel_join`, (bot, message) => {

		if (message && message.channel) {
			const { channel } = message;
			updateDashboardForChannelId(bot, channel);
		}
		
	});

	controller.on(`channel_leave`, (bot, message) => {

		if (message && message.channel) {
			const { channel } = message;
			updateDashboardForChannelId(bot, channel);
		}

	})

	// this is for updating ping functionality
	controller.hears(['^{'], 'direct_message', isJsonObject, function(bot, message) {


		let botToken = bot.config.token;
		bot          = bots[botToken];

		const SlackUserId = message.user;
		const { text }    = message;

		try {

			let jsonObject = JSON.parse(text);
			const { overrideNewSession, updatePing, cancelPing, sendBomb, PingId } = jsonObject;
			let config = {};
			if (updatePing) {
				config = { PingId, sendBomb, cancelPing };
				controller.trigger(`update_ping_message`, [bot, config]);
			} else if (overrideNewSession) {
				config = { SlackUserId, changeTimeAndTask: true }
				controller.trigger('begin_session_flow', [bot, null, config]);
			}

		}
		catch (error) {

			console.log(error);

			// this should never happen!
			bot.reply(message, "Hmm, something went wrong");
			return false;
		}

	});

	/**
	 * 	This is where we handle "Send Message" button and other buttons in dashboard
	 * 	Give `direct_message` precedence above: if it is DM it will get picked up before this catch-all `ambient`
	 */
	controller.hears(['^{'], 'ambient', isJsonObject, function(bot, message) {

		let botToken = bot.config.token;
		bot          = bots[botToken];

		const SlackUserId = message.user;
		const { text }    = message;

		try {

			let jsonObject = JSON.parse(text);
			const { setPriority, pingUser, PingToSlackUserId } = jsonObject;
			let config = {};
			if (pingUser) {
				config = { SlackUserId, pingSlackUserIds: [ PingToSlackUserId ] };
				controller.trigger(`ping_flow`, [bot, null, config]);
			} else if (setPriority) {
				config = { SlackUserId };
				controller.trigger(`begin_session_flow`, [ bot, null, config ]);
			}

		}
		catch (error) {

			console.log(error);

			// this should never happen!
			bot.reply(message, "Hmm, something went wrong");
			return false;
		}

	});

	// defer ping!
	controller.hears([utterances.deferPing], 'direct_message', function(bot, message) {

		let botToken = bot.config.token;
		bot          = bots[botToken];

		controller.trigger(`defer_ping_flow`, [ bot, message ]);

	});

	// cancel ping!
	controller.hears([utterances.cancelPing], 'direct_message', function(bot, message) {

		console.log(`\n\n huh`);

		let botToken = bot.config.token;
		bot          = bots[botToken];

		controller.trigger(`cancel_ping_flow`, [ bot, message ]);

	});

	controller.hears([utterances.sendSooner], 'direct_message', function(bot, message) {

		let botToken = bot.config.token;
		bot          = bots[botToken];

		controller.trigger(`send_sooner_flow`, [bot, message]);

	});


	controller.hears([constants.THANK_YOU.reg_exp], 'direct_message', (bot, message) => {

		let botToken = bot.config.token;
		bot          = bots[botToken];

		const SlackUserId = message.user;
		bot.send({
			type: "typing",
			channel: message.channel
		});
		bot.reply(message, "You're welcome!! :smile:");
	});

	// when user wants to "change time and task" of an existing session,
	// it will basically create new session flow
	controller.hears([utterances.changeTimeAndTask], 'direct_message', (bot, message) => {

		let botToken = bot.config.token;
		bot          = bots[botToken];

		const SlackUserId = message.user;

		bot.send({
			type: "typing",
			channel: message.channel
		});
		const config = { SlackUserId, changeTimeAndTask: true }
		controller.trigger(`begin_session_flow`, [bot, message, config]);
	});

	// TOKI_T1ME TESTER
	controller.hears(['TOKI_T1ME'], 'direct_message', (bot, message) => {

		let botToken = bot.config.token;
		bot          = bots[botToken];

		const { text } = message;
		const SlackUserId = message.user;

		bot.send({
			type: "typing",
			channel: message.channel
		});
		setTimeout(()=>{

			controller.trigger(`TOKI_TIME_flow`, [ bot, { SlackUserId }]);

		}, 1000);

	});


	controller.on('TOKI_TIME_flow', (bot, config) => {

		const { SlackUserId } = config;

		// IncluderSlackUserId is the one who's actually using Toki
		models.User.find({
			where: { SlackUserId }
		}).then((user) => {

			const { email, SlackName, tz } = user;

			bot.startPrivateConversation({ user: SlackUserId }, (err, convo) => {

				convo.say(`Hey, @${SlackName}!  Nice to meet ya`);

			});
		});
	});

}
