// this contains responses that is randomized to keep things fresh and funky

// respond to hello
export function helloResponse() {

	var helloResponses = [
		"Hey!",
		"Hello :)",
		"Hola",
		"Hello!",
		"Heyya",
		"Hey there",
		"Hello sir!"
	];
	return randomSelection(helloResponses);
}


// randomly returns a response from array
function randomSelection(responseArray) {
	var min = 0;
	var max = responseArray.length;

	const randomIndex = Math.floor(Math.random() * (max - min)) + min;

	return responseArray[randomIndex];
}

export function randomInt(min, max) {
	var randomIndex = Math.floor(Math.random() * (max - min)) + min;
	return randomIndex;
}