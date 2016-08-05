import os from 'os';
import { wit } from '../index';
import moment from 'moment-timezone';
import { randomInt, utterances } from '../../lib/botResponses';
import http from 'http';
import bodyParser from 'body-parser';

import models from '../../../app/models';
import { convertToSingleTaskObjectArray, convertArrayToTaskListMessage, convertTimeStringToMinutes, convertTaskNumberStringToArray, commaSeparateOutTaskArray, convertMinutesToHoursString, deleteConvoAskMessage, deleteMostRecentDoneSessionMessage, getDoneSessionMessageAttachments } from '../../lib/messageHelpers';
import { closeOldRemindersAndSessions, witTimeResponseToTimeZoneObject, prioritizeDailyTasks } from '../../lib/miscHelpers';

import { bots, resumeQueuedReachouts } from '../index';

import { colorsArray, buttonValues, colorsHash, TOKI_DEFAULT_SNOOZE_TIME, TOKI_DEFAULT_BREAK_TIME, sessionTimerDecisions, MINUTES_FOR_DONE_SESSION_TIMEOUT, pausedSessionOptionsAttachments, startSessionOptionsAttachments, TASK_DECISION, endBreakEarlyAttachments,  intentConfig } from '../../lib/constants';
import { doneSessionAskOptions } from '../modules/endWorkSessionFunctions';

import { notInSessionWouldYouLikeToStartOne } from './sessionOptions';

// END OF A WORK SESSION
export default function(controller) {

	// User explicitly wants to finish session early (wit intent)
	controller.hears(['done_session'], 'direct_message', wit.hears, (bot, message) => {

		/**
		 * 			check if user has open session (should only be one)
		 * 					if yes, trigger finish and end_session flow
		 * 			  	if no, reply with confusion & other options
		 */
		
		const SlackUserId      = message.user;
		const doneSessionEarly = true;

		// no open sessions
		bot.send({
			type: "typing",
			channel: message.channel
		});

		setTimeout(() => {
			if (utterances.containsTaskOrPriority.test(message.text)) {
				// want to finish off some tasks
				controller.trigger(`edit_plan_flow`, [bot, { SlackUserId }]);
			} else {
				controller.trigger(`done_session_flow`, [bot, { SlackUserId, doneSessionEarly }]);
			}
		}, 800);
	});

	/**
	 * 		User has confirmed to ending session
	 * 		This will immediately close the session, then move to
	 * 		specified "post session" options
	 */
	controller.on(`done_session_flow`, (bot, config) => {

		// you can pass in a storedWorkSession
		const { SlackUserId, storedWorkSession, sessionTimerUp, doneSessionEarly } = config;

		models.User.find({
			where: [`"SlackUser"."SlackUserId" = ?`, SlackUserId ],
			include: [
				models.SlackUser
			]
		})
		.then((user) => {

			const { SlackUser: { tz }, defaultBreakTime, defaultSnoozeTime } = user;
			const UserId = user.id;

			user.getWorkSessions({
				where: [ `"open" = ?`, true ],
				order: `"WorkSession"."createdAt" DESC`,
				include: [ models.DailyTask ]
			})
			.then((workSessions) => {

				let workSession = storedWorkSession || workSessions[0];

				if (workSession) {

					// only update endTime if it is less than current endTime
					let now     = moment();
					let endTime = moment(workSession.dataValues.endTime);
					if ( now < endTime )
						endTime = now;

					workSession.update({
						open: false,
						endTime
					})
					.then((workSession) => {

						const WorkSessionId       = workSession.id;
						let startTime             = moment(workSession.startTime).tz(tz);
						let endTime               = moment(workSession.dataValues.endTime).tz(tz);
						let endTimeString         = endTime.format("h:mm a");
						let workSessionMinutes    = Math.round(moment.duration(endTime.diff(startTime)).asMinutes());
						let workSessionTimeString = convertMinutesToHoursString(workSessionMinutes);

						workSession.getStoredWorkSession({
							where: [ `"StoredWorkSession"."live" = ?`, true ]
						})
						.then((storedWorkSession) => {

							let dailyTaskIds = workSession.DailyTasks.map((dailyTask) => {
								return dailyTask.id;
							});
							
							// this is the only dailyTask associated with workSession
							user.getDailyTasks({
								where: [ `"DailyTask"."id" IN (?)`, dailyTaskIds ],
								include: [ models.Task ]
							})
							.then((dailyTasks) => {

								if (dailyTasks.length > 0) {

									let dailyTask = dailyTasks[0]; // one task per session

									// get all live daily tasks for use
									user.getDailyTasks({
										where: [`"DailyTask"."type" = ?`, "live"],
										order: `"DailyTask"."priority" ASC`,
										include: [ models.Task ]
									})
									.then((dailyTasks) => {

										dailyTasks = convertToSingleTaskObjectArray(dailyTasks, "daily");

										// do our math update to daily task here
										let minutesSpent = dailyTask.minutesSpent;
										minutesSpent += workSessionMinutes;
										dailyTask.update({
											minutesSpent
										})
										.then((dailyTask) => {

											bot.startPrivateConversation( { user: SlackUserId }, (err, convo) => {

												convo.sessionDone = {
													UserId,
													SlackUserId,
													defaultBreakTime,
													defaultSnoozeTime,
													tz,
													dailyTasks,
													doneSessionEarly,
													sessionTimerUp,
													reminders: [],
													currentSession: {
														WorkSessionId,
														startTime,
														endTime,
														workSessionMinutes,
														workSessionTimeString,
														dailyTask,
														additionalMinutes: false
													},
													extendSession: false,
													postSessionDecision: false,
													priorityDecision: { // what we want to do with our priorities as a result of session
														replacePriority: {}, // config for totally new priority
														switchPriority: {} // config to switch priority worked on this session
													}
												}

												if (storedWorkSession) {
													workSessionMinutes    = storedWorkSession.dataValues.minutes;
													workSessionTimeString = convertMinutesToHoursString(workSessionMinutes);
													// currently paused
													convo.doneSessionEarly.currentSession.isPaused = true;
													convo.doneSessionEarly.currentSession.workSessionTimeString = workSessionTimeString;
												}

												doneSessionAskOptions(convo);


												convo.on('end', (convo) => {

													console.log("\n\n\n session is done!");
													console.log(convo.sessionDone.priorityDecision);
													console.log("\n\n\n");

													const { SlackUserId, reminders, extendSession, postSessionDecision, currentSession: { WorkSessionId, workSessionMinutes, dailyTask }, priorityDecision } = convo.sessionDone;

													// if extend session, rest doesn't matter!
													if (extendSession) {
														workSession.update({
															open: true,
															live: true,
															endTime: extendSession
														});
														return;
													}

													reminders.forEach((reminder) => {
														const { remindTime, customNote, type } = reminder;
														models.Reminder.create({
															UserId,
															remindTime,
															customNote,
															type
														});
													});

													resumeQueuedReachouts(bot, { SlackUserId });

													// this is where you do the math with passed in info
													const { replacePriority, switchPriority } = priorityDecision;

													if (Object.keys(switchPriority).length > 0) {
														const { newPriorityIndex } = switchPriority;
														console.log("\n\n\nokay dealing with switch priority!");
														console.log(dailyTasks[newPriorityIndex]);
														let newDailyTask = dailyTasks[newPriorityIndex];

														// 1. undo minutesSpent to dailyTask
														let { minutesSpent } = dailyTask.dataValues;
														minutesSpent -= workSessionMinutes;
														dailyTask.update({
															minutesSpent
														});

														// 2. update workSession back on
														// 3. update workSession.dailyTasks to this task!
														models.WorkSession.update({
															open: true
														}, {
															where: [`"WorkSessions"."id" = ?`, WorkSessionId]
														})
														.then((workSession) => {
															// delete existing dailyTasks associated
															// with the workSession,
															// then replace with new dailyTask
															models.WorkSessionTask.destroy({
																where: [`"WorkSessionTasks"."WorkSessionId" = ?`, WorkSessionId]
															})
															.then(() => {
																models.WorkSessionTask.create({
																	WorkSessionId,
																	DailyTaskId: newDailyTask.dataValues.id
																})
																bot.startPrivateConversation( { user: SlackUserId }, (err, convo) => {
																	convo.say(`Okay! I put time towards that priority instead`);
																	convo.next();
																	convo.on('end', (convo) => {
																		controller.trigger(`done_session_flow`, [bot, { SlackUserId }]);
																	})
																});
																return;
															});
														})


													} else if (Object.keys(replacePriority).length > 0) {
														const { dailyTaskIndexToReplace, newTaskText, additionalMinutes } = replacePriority;
														console.log("\n\n\n replacing this task:");
														console.log(dailyTasks[dailyTaskIndexToReplace]);
														console.log(replacePriority);

														// 1. undo minutes to task

														// if no additional minutes, then no more minutes to what you used this session for, and set it to completed
														
														// if additional minutes, do minutesSpent on this session + the additional minutes, and that task is no longer completed
														
													} else {
														// COMPLETED!!!!
														bot.startPrivateConversation( { user: SlackUserId }, (err, convo) => {
															convo.say(`Let's goooo. You're one step closer to winning the day! You have `)
														});
													}

												})

											});

										});
									})

								}

							});

						});
					})

				} else {

					let config = { bot, controller, SlackUserId };
					notInSessionWouldYouLikeToStartOne(config);

				}

			});

		});

	});

}



