import os from 'os';
import { wit } from '../index';
import http from 'http';
import bodyParser from 'body-parser';
import moment from 'moment-timezone';

import models from '../../../app/models';

import { utterances } from '../../lib/botResponses';
import { convertResponseObjectsToTaskArray, convertArrayToTaskListMessage, convertTimeStringToMinutes, convertToSingleTaskObjectArray, prioritizeTaskArrayFromUserInput, convertTaskNumberStringToArray, getMostRecentTaskListMessageToUpdate, deleteConvoAskMessage, convertResponseObjectToNewTaskArray, getTimeToTaskTextAttachmentWithTaskListMessage, commaSeparateOutTaskArray, getNewPlanAttachments } from '../../lib/messageHelpers';
import { constants, colorsHash, buttonValues, taskListMessageNoButtonsAttachment } from '../../lib/constants';
import { witTimeResponseToTimeZoneObject, witDurationToMinutes, mapTimeToTaskArray } from '../../lib/miscHelpers';

/**
 * 		NEW PLAN CONVERSATION FLOW FUNCTIONS
 */

export function startNewPlanFlow(convo) {

	const { task: { bot }, newPlan: { daySplit, autoWizard } } = convo;
	let { newPlan: { prioritizedTasks } }                      = convo;

	let contextDay = "today";
	if (daySplit != constants.MORNING.word) {
		contextDay = `this ${daySplit}`;
	}
	let question = `What are the 3 outcomes you want to make happen today?`
	if (autoWizard) {
		question = `${question} Please enter each one in a separate message`
	}

	prioritizedTasks = [];
	let options = { dontShowMinutes: true, dontCalculateMinutes: true };
	let taskListMessage;
	convo.ask({
		text: question,
		attachments: getNewPlanAttachments(prioritizedTasks)
	},
	[
		{
			pattern: utterances.startsWithHelp,
			callback: function(response, convo) {

				convo.newPlan.prioritizedTasks = [];

				convo.say("Okay, let's do do this together!");
				wizardPrioritizeTasks(convo);
				convo.next();

			}
		},
		{
			pattern: buttonValues.redoTasks.value,
			callback: function(response, convo) {

				prioritizedTasks               = [];
				convo.newPlan.prioritizedTasks = prioritizedTasks;

				convo.say("Okay, let's try this again :repeat:");
				startNewPlanFlow(convo);
				convo.next();

			}
		},
		{
			pattern: utterances.done,
			callback: function(response, convo) {

				convo.newPlan.prioritizedTasks = prioritizedTasks;

				convo.say("Excellent!");

				if (autoWizard) {
					prioritizeTasks(convo);
				} else {
					prioritizeTasks(convo);
				}

				convo.next();
			}
		},
		{ // this is additional task added in this case.
			default: true,
			callback: function(response, convo) {

				const updateTaskListMessageObject = getMostRecentTaskListMessageToUpdate(response.channel, bot);

				let newTaskArray = convertResponseObjectToNewTaskArray(response);
				newTaskArray.forEach((newTask) => {
					prioritizedTasks.push(newTask);
				});

				taskListMessage = convertArrayToTaskListMessage(prioritizedTasks, options);

				updateTaskListMessageObject.text = `${question}\n${taskListMessage}`;

				let attachments = getNewPlanAttachments(prioritizedTasks);

				if (prioritizedTasks.length < 3) {
					updateTaskListMessageObject.attachments = JSON.stringify(attachments);
					bot.api.chat.update(updateTaskListMessageObject);
				} else {

					while (prioritizedTasks.length > 3) {
						// only 3 priorities!
						prioritizedTasks.pop();
					}

					// we move on, with default to undo.
					updateTaskListMessageObject.attachments = JSON.stringify(taskListMessageNoButtonsAttachment);
					bot.api.chat.update(updateTaskListMessageObject);

					convo.newPlan.prioritizedTasks = prioritizedTasks;

					convo.say("Excellent!");

					if (autoWizard) {
						prioritizeTasks(convo);
					} else {
						prioritizeTasks(convo);
					}

					convo.next();

				}
				
			}
		}
	]);

}

function wizardPrioritizeTasks(convo) {

	convo.ask(`What is your one result from today, that alone would make you feel most accomplished?`, (response, convo) => {
		convo.say("Awesome!");
		convo.next();
	});

}

function prioritizeTasks(convo, question = '') {

	const { task: { bot }, newPlan: { daySplit, autoWizard } } = convo;
	let { newPlan: { prioritizedTasks } } = convo;

	if (question == '') // this is the default question!
		question = `How would you rank your ${prioritizedTasks.length} priorities in order of most meaningful to your day?`;

	if (prioritizedTasks.length == 1) {
		// 1 task needs no prioritizing
		convo.newPlan.startTask.index = 0;
		getTimeToTask(convo);
	} else {
		// 2+ tasks need prioritizing
		let options         = { dontShowMinutes: true, dontCalculateMinutes: true };
		let taskListMessage = convertArrayToTaskListMessage(prioritizedTasks, options);

		convo.ask({
			text: `${question}\n${taskListMessage}`,
			attachments: [
				{
					attachment_type: 'default',
					callback_id: "KEEP_TASK_ORDER",
					fallback: "Let's keep this task order!",
					color: colorsHash.grey.hex,
					actions: [
						{
								name: buttonValues.keepTaskOrder.name,
								text: "Keep this order!",
								value: buttonValues.keepTaskOrder.value,
								type: "button"
						}
					]
				}
			]
		}, [
			{
				pattern: utterances.startsWithKeep,
				callback: (response, convo) => {

					convo.say("This order looks great to me, too!");
					convo.next();

				}
			},
			{
				default: true,
				callback: (response, convo) => {

					let taskNumbersToWorkOnArray = convertTaskNumberStringToArray(response.text, prioritizedTasks);

					let necessaryNumbers = [];
					for (let i = 0; i < prioritizedTasks.length; i++) {
						let number = i+1;
						necessaryNumbers.push(number);
					}

					let newPrioritizedTaskNumbers = taskNumbersToWorkOnArray.slice();
					// this tests if the arrays contain the same values or not
					if (taskNumbersToWorkOnArray.sort().join(',') === necessaryNumbers.sort().join(',')) {

						let newPrioritizedTasks = [];
						newPrioritizedTaskNumbers.forEach((taskNumber) => {
							let index = taskNumber - 1;
							newPrioritizedTasks.push(prioritizedTasks[index]);
						});
						convo.newPlan.prioritizedTasks = newPrioritizedTasks;
						
						convo.say("Love it!");

					} else {

						necessaryNumbers.reverse();
						let numberString = necessaryNumbers.join(", ");
						convo.say("Sorry, I didn't catch that");
						let repeatQuestion = `Let me know how you would rank your ${prioritizedTasks.length} priorities in order of importance by listing the numbers \`i.e. ${numberString}\``
						prioritizeTasks(convo, repeatQuestion);

					}

					convo.next();

				}
			}
		]);
	}


}

/*
function prioritizeTasks(convo, question = '') {

	const { task: { bot }, newPlan: { daySplit, autoWizard } } = convo;
	let { newPlan: { prioritizedTasks } } = convo;

	if (question == '') // this is the default question!
		question = `Out of your ${prioritizedTasks.length} priorities, which one would most make the rest of your day easier, or your other tasks more irrelevant?`;

	if (prioritizedTasks.length == 1) {
		// 1 task needs no prioritizing
		convo.newPlan.startTask.index = 0;
		getTimeToTask(convo);
	} else {
		// 2+ tasks need prioritizing

		let options         = { dontShowMinutes: true, dontCalculateMinutes: true };
		let taskListMessage = convertArrayToTaskListMessage(prioritizedTasks, options);

		convo.ask({
			text: `${question}\n${taskListMessage}`,
			attachments: [
				{
					attachment_type: 'default',
					callback_id: "REDO_TASKS",
					fallback: "Do you want to work on this task?",
					color: colorsHash.grey.hex,
					actions: [
						{
								name: buttonValues.redoMyPriorities.name,
								text: "Redo my priorities!",
								value: buttonValues.redoMyPriorities.value,
								type: "button"
						}
					]
				}
			]
		}, [
			{
				pattern: utterances.containsRedo,
				callback: (response, convo) => {

					convo.say("Okay, let's try this again :repeat:");
					startNewPlanFlow(convo);
					convo.next();

				}
			},
			{
				pattern: utterances.containsNumber,
				callback: (response, convo) => {

					let taskNumbersToWorkOnArray = convertTaskNumberStringToArray(response.text, prioritizedTasks);
					let taskIndexToWorkOn        = taskNumbersToWorkOnArray[0] - 1;

					if (taskIndexToWorkOn >= 0) {
						convo.newPlan.startTask.index = taskIndexToWorkOn;
						getTimeToTask(convo);
					} else {
						convo.say("Sorry, I didn't catch that. Let me know a number `i.e. task 2`");
						convo.repeat();
					}

					convo.next();
				}
			},
			{
				default: true,
				callback: (response, convo) => {
					convo.say("Sorry, I didn't catch that. Let me know a number `i.e. task 2`");
					convo.repeat();
					convo.next();
				}
			}
		]);
	}

}
*/

function getTimeToTask(convo) {

	const { tz, daySplit, autoWizard, startTask } = convo.newPlan;
	let { newPlan: { prioritizedTasks } }              = convo;

	let taskString = prioritizedTasks[startTask.index].text;

	let attachments = [];
	if (prioritizedTasks.length > 1) {
		attachments.push({
			attachment_type: 'default',
			callback_id: "CHANGE_TASK",
			fallback: "Do you want to work on a different task?",
			color: colorsHash.grey.hex,
			actions: [
				{
						name: buttonValues.workOnDifferentTask.name,
						text: "Different task instead",
						value: buttonValues.workOnDifferentTask.value,
						type: "button"
				}
			]
		});
	}

	convo.say({
		text: `Great! Let's make time to do \`${taskString}\` then :punch:`,
		attachments
	});

	convo.ask({
		text: `How much time do you want to put towards this priority?`
	}, [
		{
			pattern: utterances.containsDifferent,
			callback: (response, convo) => {

				convo.say("Okay, let's do a different task!");

				let question = "What task do you want to start with instead?";
				wizardPrioritizeTasks(convo, question);
				convo.next();

			}
		},
		{
			default: true,
			callback: (response, convo) => {

				// use wit to decipher the relative time. if no time, then re-ask
				const { intentObject: { entities: { duration, datetime } } } = response;
				let customTimeObject = witTimeResponseToTimeZoneObject(response, tz);

				let minutes = 0;
				let now = moment();

				if (duration) {
					minutes = witDurationToMinutes(duration);
				} else {
					minutes = convertTimeStringToMinutes(response.text);
				}

				if (minutes > 0) {
					convo.say(`Got it!`);
					convo.newPlan.startTask.minutes = minutes;
					startOnTask(convo);
				} else {
					convo.say("Sorry, I didn't catch that. Let me know a time `i.e. 45 minutes`");
					convo.repeat();
				}

				convo.next();

			}
		}
	])

}

function startOnTask(convo) {

	const { tz, daySplit, autoWizard, startTask } = convo.newPlan;
	let { newPlan: { prioritizedTasks } }         = convo;

	let timeExample = moment().tz(tz).add(15, "minutes").format("h:mma");
	convo.ask({
		text: `When would you like to start? You can tell me a specific time, like \`${timeExample}\`, or a relative time, like \`in 15 minutes\``,
		attachments: [
			{
				attachment_type: 'default',
				callback_id: "DO_TASK_NOW",
				fallback: "Let's do it now!",
				color: colorsHash.grey.hex,
				actions: [
					{
							name: buttonValues.workOnTaskNow.name,
							text: "Let's do it now!",
							value: buttonValues.workOnTaskNow.value,
							type: "button"
					}
				]
			}
		]}, [
		{
			pattern: utterances.containsNow,
			callback: (response, convo) => {

				convo.say("Okay, let's do this now :muscle:");
				convo.next();

			}
		},
		{
			default: true,
			callback: (response, convo) => {

				// use wit to decipher the relative time. if no time, then re-ask
				const { intentObject: { entities: { duration, datetime } } } = response;
				var customTimeObject = witTimeResponseToTimeZoneObject(response, tz);

				let minutes;
				let now = moment();
				if (customTimeObject) {
					convo.newPlan.startTime = customTimeObject;
					if (duration) {
						minutes = witDurationToMinutes(duration);
					} else {
						minutes = parseInt(moment.duration(customTimeObject.diff(now)).asMinutes());
					}
					let timeString = customTimeObject.format("h:mm a");
					convo.say(`Okay! I'll ping you in ${minutes} minutes at ${timeString} :wave:`);
					convo.next();
				} else {
					convo.say("Sorry, I didn't catch that. Let me know a time `i.e. let's start in 10 minutes`");
					convo.repeat();
				}

				convo.next();

			}
		}
	]);
}


