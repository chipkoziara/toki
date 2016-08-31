import { wit, bots } from '../index';
import moment from 'moment-timezone';
import models from '../../../app/models';

import { utterances, colorsArray, buttonValues, colorsHash, constants } from '../../lib/constants';
import { witTimeResponseToTimeZoneObject, convertMinutesToHoursString } from '../../lib/messageHelpers';
import { startEndSessionFlow } from './endSessionFunctions';
import { sendGroupPings } from '../pings/pingFunctions';


// END OF A WORK SESSION
export default function(controller) {

	// User explicitly wants to finish session early (wit intent)
	controller.hears(['end_session'], 'direct_message', wit.hears, (bot, message) => {

		let botToken = bot.config.token;
		bot          = bots[botToken];

		/**
		 * 			check if user has open session (should only be one)
		 * 					if yes, trigger finish and end_session flow
		 * 			  	if no, reply with confusion & other options
		 */
		
		const SlackUserId      = message.user;
		const endSessionType   = constants.endSessionTypes.endSessionEarly;

		const config = { SlackUserId, endSessionType };

		// no open sessions
		bot.send({
			type: "typing",
			channel: message.channel
		});

		setTimeout(() => {
			controller.trigger(`end_session_flow`, [bot, config]);
		}, 800);

	});

	/**
	 * 		User has confirmed to ending session
	 * 		This will immediately close the session, then move to
	 * 		specified "post session" options
	 */
	controller.on(`end_session_flow`, (bot, config) => {

		// pingInfo only relevant when endSessionType == `endByPingToUserId`
		const { SlackUserId, endSessionType, pingInfo } = config;

		models.User.find({
			where: { SlackUserId }
		})
		.then((user) => {

			const { tz } = user;
			const UserId = user.id;

			user.getSessions({
				where: [ `"open" = ?`, true ],
				order: `"Session"."createdAt" DESC`
			})
			.then((sessions) => {

				let session = sessions[0] || false;

				/*
				* 	1. get all the `endSession` pings for ToUserId 
				* 	2. get all the live sessions for FromUserId (pingers)
				* 	3. match up sessions with pings into `pingContainer` (`pingContainer.ping` && `pingContainer.session`)
				* 	4. run logic based on whether ping has session
				*/
				models.Ping.findAll({
					where: [ `("Ping"."ToUserId" = ? OR "Ping"."FromUserId" = ?) AND "Ping"."live" = ? AND "Ping"."deliveryType" = ?`, UserId, UserId, true, constants.pingDeliveryTypes.sessionEnd ],
					include: [
						{ model: models.User, as: `FromUser` },
						{ model: models.User, as: `ToUser` },
						models.PingMessage
					],
					order: `"Ping"."createdAt" ASC`
				}).then((pings) => {

					// get all the sessions associated with pings that come FromUser
					let pingerSessionPromises = [];

					pings.forEach((ping) => {
						const { FromUserId, ToUserId } = ping;
						pingerSessionPromises.push(models.Session.find({
							where: {
								UserId: [ FromUserId, ToUserId ],
								live: true,
								open: true
							},
							include: [ models.User ]
						}));
					});

					Promise.all(pingerSessionPromises)
					.then((pingerSessions) => {

						// this object holds pings in relation to the UserId of the session that just ended!
						// fromUser are pings that the user sent out
						// toUser are pings that got sent to the user
						// need to batch by unique fromUser <=> toUser combinations
						let pingContainers = {
							fromUser: { toUser: {} },
							toUser: { fromUser: {} }
						};

						// create the pingContainer by matching up `ping` with live `session`. then group it in the appropriate place in pingContainers
						// if no live session, `session` will be false
						pings.forEach((ping) => {

							const pingFromUserId      = ping.dataValues.FromUserId;
							const pingToUserId        = ping.dataValues.ToUserId;

							// these are pings from user who just ended ession
							if (pingFromUserId == UserId) {

								// create new container if it doesn't exist
								let pingContainer = pingContainers.fromUser.toUser[pingToUserId] || { session: false, pings: [] };

								pingerSessions.forEach((pingerSession) => {
									if (pingerSession && pingToUserId == pingerSession.dataValues.UserId) {
										// recipient of ping is in session
										pingContainer.session = pingerSession;
										return;
									}
								});

								pingContainer.user = ping.dataValues.ToUser;
								pingContainer.pings.push(ping);
								pingContainers.fromUser.toUser[pingToUserId] = pingContainer;

							} else if (pingToUserId == UserId) {
								// these are pings to user who just ended session
								
								// create new if doesn't exist
								let pingContainer = pingContainers.toUser.fromUser[pingFromUserId] || { session: false, pings: [] };

								pingerSessions.forEach((pingerSession) => {
									if (pingerSession && pingFromUserId == pingerSession.dataValues.UserId) {
										pingContainer.session = pingerSession;
										return;
									}
								});

								pingContainer.user = ping.dataValues.FromUser;
								pingContainer.pings.push(ping);
								pingContainers.toUser.fromUser[pingFromUserId] = pingContainer;

							}

						});

						// strip out the irrelevant pingContainers (ones where FromUserId is in live, `superFocus` session)
						for (let fromUserId in pingContainers.toUser.fromUser) {

							if (!pingContainers.toUser.fromUser.hasOwnProperty(fromUserId)) {
								continue;
							}

							// delete if in superFocus session
							if (pingContainers.toUser.fromUser[fromUserId].session && pingContainers.toUser.fromUser[fromUserId].session.dataValues.superFocus) {
								delete pingContainers.toUser.fromUser[fromUserId];
							}
							
						}


						bot.startPrivateConversation({ user: SlackUserId }, (err, convo) => {

							if (err) {
								console.log(`\n\n\n error! ${err} \n\n\n`);
								return;
							}

							// have 5-minute exit time limit
							convo.task.timeLimit = 1000 * 60 * 5;

							convo.sessionEnd = {
								UserId,
								SlackUserId,
								tz,
								user,
								pingContainers,
								endSessionType,
								pingInfo
							}

							// end the session if it exists!
							if (session) {

								let now     = moment();
								let endTime = moment(session.dataValues.endTime);
								if ( now < endTime )
									endTime = now;

								// END THE SESSION HERE
								session.update({
									open: false,
									live: false,
									endTime
								})
								.then((session) => {

									convo.sessionEnd.session = session;

									models.Session.update({
										open: false,
										live: false
									}, {
										where: [ `"Sessions"."UserId" = ? AND ("Sessions"."open" = ? OR "Sessions"."live" = ?)`, UserId, true, true ]
									});

									// start the flow after ending session
									startEndSessionFlow(convo);

								});
							} else {
								// go thru flow without session to end
								startEndSessionFlow(convo);
							}

							convo.on('end', (convo) => {

								// all the ping objects here are relevant!
								const { pingContainers, endSessionType, pingInfo, user } = convo.sessionEnd;

								// pings queued to this user who just ended this session
								for (let fromUserId in pingContainers.toUser.fromUser) {

									if (!pingContainers.toUser.fromUser.hasOwnProperty(fromUserId)) {
										continue;
									}

									const pingContainer      = pingContainers.toUser.fromUser[fromUserId];
									const FromUser           = pingContainer.user;
									const { session, pings } = pingContainer;
									const deliveryType       = constants.pingDeliveryTypes.sessionEnd

									// update then send
									let pingPromises = [];
									pings.forEach((ping) => {
										pingPromises.push(models.Ping.update({
											live: false
										},{
											where: { id: ping.dataValues.id }
										}));
									});

									// if sent, turn ping off and continue
									if (sendGroupPings(pings, deliveryType)) {

										Promise.all(pingPromises)
										.then((value) => {

											// if previous ping is what ended session together,
											// no need to put FromUser back through endSessionFlow
											// because FromUser's session has just gotten ended
											if (pingInfo && pingInfo.thisPingEndedUsersSessionsTogether && pingInfo.FromUser.dataValues.SlackUserId == FromUser.dataValues.SlackUserId) {
												return;
											} else {

												// else, put FromUser of these pings thru endSession flow!
												const endSessionConfig = {
													endSessionType: constants.endSessionTypes.endByPingToUserId,
													pingInfo: {
														FromUser,
														ToUser: user,
														session, // did this come while in session?
														endSessionType // whether OG user ended early or sessionTimerUp
													},
													SlackUserId: FromUser.dataValues.SlackUserId
												};

												if (pingContainer.thisPingEndedUsersSessionsTogether) {
													endSessionConfig.pingInfo.thisPingEndedUsersSessionsTogether = thisPingEndedUsersSessionsTogether;
												}

												controller.trigger(`end_session_flow`, [bot, endSessionConfig]);

											}

										});

									}

								}

								// pings from this end_session user to other users
								for (let toUserId in pingContainers.fromUser.toUser) {
		
									if (!pingContainers.fromUser.toUser.hasOwnProperty(toUserId)) {
										continue;
									}

									const pingContainer      = pingContainers.fromUser.toUser[toUserId];
									const ToUser             = pingContainer.user;
									const { session, pings } = pingContainer;
									const deliveryType       = constants.pingDeliveryTypes.sessionEnd

									// if ToUser is not in session,
									// send pings that are from this user!
									if (!session) {

										let pingPromises = [];
										pings.forEach((ping) => {
											pingPromises.push(models.Ping.update({
												live: false
											},{
												where: { id: ping.dataValues.id }
											}));
										});

										if (sendGroupPings(pings, deliveryType)) {
											Promise.all(pingPromises);
										}

									}

								}

							});
						});

					});
				});

			});

		});

	});

}


