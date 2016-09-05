import { wit, bots } from '../index';
import moment from 'moment-timezone';
import models from '../../../app/models';

import { utterances, colorsArray, constants, buttonValues, colorsHash, timeZones, tokiExplainAttachments } from '../../lib/constants';
import { convertMinutesToHoursString } from '../../lib/messageHelpers';

export default function(controller) {

	/**
	 * DEFAULT FALLBACK
	 */
	controller.hears([constants.ANY_CHARACTER.reg_exp], 'direct_message', (bot, message) => {

		let botToken = bot.config.token;
		bot          = bots[botToken];

		const { text } = message;

		const SlackUserId = message.user;
		bot.send({
			type: "typing",
			channel: message.channel
		});
		setTimeout(() => {

			let replyMessage = "I'm not sure what you mean by that :thinking_face:";

			const config = { SlackUserId };

			// some fallbacks for button clicks
			switch (text) {
				case (text.match(utterances.keepWorking) || {}).input:
					controller.trigger(`current_session_status`, [bot, config])
					break;
				default:
					bot.reply(message, replyMessage);
					controller.trigger(`current_session_status`, [bot, config])
					break;
			}

		}, 500);
	});

	controller.on('explain_toki_flow', (bot, config) => {

		let botToken = bot.config.token;
		bot          = bots[botToken];

		const { fromUserConfig, toUserConfig } = config;

		models.User.find({
			where: { SlackUserId: toUserConfig.SlackUserId }
		}).then((toUser) => {

			const { SlackUserId } = toUser;

			bot.startPrivateConversation({ user: SlackUserId }, (err,convo) => {

				// have 5-minute exit time limit
				if (convo)
					convo.task.timeLimit = 1000 * 60 * 5;

				convo.say(`Hey! <@${fromUserConfig.SlackUserId}> wanted me to explain how I can also help you get your most meaningful things done each day`);
				convo.say(`Think of me as an office manager for each of your teammate's attention. *I make sure you only get interrupted with messages that are actually urgent*, so that you can maintain focus on your priorities`);
				convo.say(`On the flip side, *I also make it easy for you to ping teammates when they're actually ready to switch contexts.* This lets you get requests out of your head when you think of them, while making sure it doesn't unnecessarily interrupt anyone's flow`);
				convo.say({
					text: `Here's how I do this:`,
					attachments: tokiExplainAttachments
				});
				convo.say(`I'm here whenever you're ready to go! Just let me know when you want to \`/ping\` someone, or enter a \`/focus\` session yourself :raised_hands:`);

				convo.on(`end`, (convo) => {

				});

			});

		});

	});

	controller.on('daily_recap_flow', (bot, config) => {

		let botToken = bot.config.token;
		bot          = bots[botToken];

		const { SlackUserId, fromThisDateTime } = config;
		let now = moment();

		models.User.find({
			where: { SlackUserId }
		}).then((user) => {

			const { tz, dailyRecapTime } = user;
			const UserId = user.id;

			// i.e. `You sent 5 pings today`
			// vs `You sent 5 pings since Friday`
			let sinceDayString = `today`;
			if (Math.ceil(moment.duration(now.diff(fromThisDateTime)).asDays()) > 1) {
				let day = fromThisDateTime.tz(tz).format('dddd');
				sinceDayString = `since ${day}`;
			}

			const dailyRecapTimeObject = moment(dailyRecapTime).tz(tz);

			let fromThisDateTimeString = fromThisDateTime.format("YYYY-MM-DD HH:mm:ss Z");
			user.getSessions({
				where: [`"startTime" > ?`, fromThisDateTimeString]
			})
			.then((sessions) => {

				models.Ping.findAll({
					where: [ `("Ping"."ToUserId" = ? OR "Ping"."FromUserId" = ?) AND "Ping"."createdAt" > ?`, UserId, UserId, fromThisDateTimeString ],
					include: [
						{ model: models.User, as: `FromUser` },
						{ model: models.User, as: `ToUser` },
						models.PingMessage
					],
					order: `"Ping"."createdAt" ASC`
				})
				.then((pings) => {

					let fromUserPings = [];
					let toUserPings   = [];

					pings.forEach((ping) => {
						if (ping.FromUserId == UserId) {
							fromUserPings.push(ping);
						} else if (ping.ToUserId == UserId) {
							toUserPings.push(ping);
						}
					});

					bot.startPrivateConversation({ user: SlackUserId }, (err,convo) => {

						// have 5-minute exit time limit
						if (convo)
							convo.task.timeLimit = 1000 * 60 * 5;

						if (sessions.length > 0 || toUserPings.length > 0 || fromUserPings.length > 0) {
							convo.say(`Hey <@${SlackUserId}>!`);
						}
							

						// sessions recap
						if (sessions.length > 0) {

							let text                = ``;
							let attachments         = [];
							let totalTimeInSessions = 0;

							sessions.forEach((session) => {

								const { content, startTime, endTime } = session;

								const startTimeObject   = moment(startTime).tz(tz);
								const endTimeObject     = moment(endTime).tz(tz);
								const sessionMinutes    = Math.round(moment.duration(endTimeObject.diff(startTimeObject)).asMinutes());
								const sessionTimeString = convertMinutesToHoursString(sessionMinutes);

								totalTimeInSessions += sessionMinutes;

								const sessionInfoMessage = `\`${content}\` for *${sessionTimeString}*`;

								attachments.push({
									attachment_type: 'default',
									mrkdwn_in: ["text", "pretext"],
									callback_id: "SESSION_INFO",
									color: colorsHash.toki_purple.hex,
									fallback: sessionInfoMessage,
									text: sessionInfoMessage
								});

							});

							const totalTimeInSessionsString = convertMinutesToHoursString(totalTimeInSessions);
							text = `You spent ${totalTimeInSessionsString} in focused sessions ${sinceDayString}. Here's a quick breakdown of what you spent your time on:`;

							convo.say({
								text,
								attachments
							});

						}

						// pings sent to recap
						if (toUserPings.length > 0) {

							let text              = ``;
							let attachments       = [];
							let totalPingsToCount = toUserPings.length;
							let totalBombsToCount = 0;

							let toUserPingsContainer = { fromUser: {} };

							toUserPings.forEach((ping) => {

								const { dataValues: { FromUser, deliveryType } } = ping;
								const FromUserSlackUserId = FromUser.dataValues.SlackUserId;

								let pingContainer = toUserPingsContainer.fromUser[FromUserSlackUserId] || { bombCount: 0, pingCount: 0 };
								pingContainer.pingCount++;
								if (deliveryType == constants.pingDeliveryTypes.bomb) {
									pingContainer.bombCount++;
									totalBombsToCount++;
								}
								toUserPingsContainer.fromUser[FromUserSlackUserId] = pingContainer;

							});

							let SlackUserIdForMostBombs;
							let mostBombs = 0;
							let SlackUserIdForMostPings;
							let mostPings = 0;

							for (let FromUserSlackUserId in toUserPingsContainer.fromUser) {

								if (!toUserPingsContainer.fromUser.hasOwnProperty(FromUserSlackUserId)) {
									continue;
								}

								const pingContainer = toUserPingsContainer.fromUser[FromUserSlackUserId];
								const { bombCount, pingCount } = pingContainer;

								if (bombCount > mostBombs) {
									mostBombs               = bombCount;
									SlackUserIdForMostBombs = FromUserSlackUserId;
								}
								if (pingCount > mostPings) {
									mostPings               = pingCount;
									SlackUserIdForMostPings = FromUserSlackUserId;
								}

							}

							let pingCountString = totalPingsToCount == 1 ? `*${totalPingsToCount}* ping` : `*${totalPingsToCount}* pings`;
							let bombCountString = totalBombsToCount == 1 ? `${totalBombsToCount} bomb` : `${totalBombsToCount} bombs`;
							text = `You received ${pingCountString} ${sinceDayString}, including ${bombCountString} that interrupted your workflow:`;
							
							if (mostPings > 0) {
								let mostPingsString = `Most pings received from: <@${SlackUserIdForMostPings}> :mailbox_closed:`;
								attachments.push({
									attachment_type: 'default',
									mrkdwn_in: ["text", "pretext"],
									callback_id: "PINGS_RECEIVED_FROM",
									fallback: mostPingsString,
									text: mostPingsString
								})
							}
							if (mostBombs) {
								
								let mostBombsString = `Most bombs received from: <@${SlackUserIdForMostBombs}> :bomb:`;
								attachments.push({
									attachment_type: 'default',
									mrkdwn_in: ["text", "pretext"],
									callback_id: "BOMBS_RECEIVED_FROM",
									fallback: mostBombsString,
									text: mostBombsString
								});

							}

							convo.say({
								text,
								attachments
							});

						}

						// pings sent from recap
						if (fromUserPings.length > 0) {

							let text                = ``;
							let attachments         = [];
							let totalPingsFromCount = fromUserPings.length;
							let totalBombsFromCount = 0;

							let fromUserPingsContainer = { toUser: {} };

							fromUserPings.forEach((ping) => {

								const { dataValues: { ToUser, deliveryType } } = ping;
								const ToUserSlackUserId = ToUser.dataValues.SlackUserId;

								let pingContainer = fromUserPingsContainer.toUser[ToUserSlackUserId] || { bombCount: 0, pingCount: 0 };
								pingContainer.pingCount++;
								if (deliveryType == constants.pingDeliveryTypes.bomb) {
									pingContainer.bombCount++;
									totalBombsFromCount++;
								}
								fromUserPingsContainer.toUser[ToUserSlackUserId] = pingContainer;

							});

							let SlackUserIdForMostBombs;
							let mostBombs = 0;
							let SlackUserIdForMostPings;
							let mostPings = 0;

							for (let ToUserSlackUserId in fromUserPingsContainer.toUser) {

								if (!fromUserPingsContainer.toUser.hasOwnProperty(ToUserSlackUserId)) {
									continue;
								}

								const pingContainer = fromUserPingsContainer.toUser[ToUserSlackUserId];
								const { bombCount, pingCount } = pingContainer;

								if (bombCount > mostBombs) {
									mostBombs               = bombCount;
									SlackUserIdForMostBombs = ToUserSlackUserId;
								}
								if (pingCount > mostPings) {
									mostPings               = pingCount;
									SlackUserIdForMostPings = ToUserSlackUserId;
								}

							}

							let pingCountString = totalPingsFromCount == 1 ? `*${totalPingsFromCount}* ping` : `*${totalPingsFromCount}* pings`;
							let bombCountString = totalBombsFromCount == 1 ? `${totalBombsFromCount} bomb` : `${totalBombsFromCount} bombs`;
							text = `You sent ${pingCountString} ${sinceDayString}, including ${bombCountString} that interrupted a team member's workflow:`;
							
							if (mostPings > 0) {
								let mostPingsString = `Most pings sent to: <@${SlackUserIdForMostPings}> :mailbox_closed:`;
								attachments.push({
									attachment_type: 'default',
									mrkdwn_in: ["text", "pretext"],
									callback_id: "PINGS_SENT_TO",
									fallback: mostPingsString,
									text: mostPingsString
								})
							}
							if (mostBombs) {
								
								let mostBombsString = `Most bombs sent to: <@${SlackUserIdForMostBombs}> :bomb:`;
								attachments.push({
									attachment_type: 'default',
									mrkdwn_in: ["text", "pretext"],
									callback_id: "BOMBS_RECEIVED_FROM",
									fallback: mostBombsString,
									text: mostBombsString
								});

							}

							convo.say({
								text,
								attachments
							});

						}


					});

				});

			});


		});

	});

}


