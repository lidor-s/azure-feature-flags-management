const featureFlagBooleanDefaultValues = ["true", "false"];
var lastIndex = 0;
var storageFeatureFlags = [];
document.getElementById("navigateButton").addEventListener('click', () => calculateAndNavigateNewUrl(), false);
document.getElementById("featureFlag_addContainer").addEventListener('click', () => addFeatureFlag(), false);

// initialize
chrome.tabs.query({active: true, currentWindow: true}, function(tabs)
{
	let activeTabUrl = tabs[0].url;

	getFavoritesFromStorage(function(result) {
		let storedFeatureFlags = copyArray(getFavoritesFromFavoritesStorageResult(result));
		storageFeatureFlags = copyArray(getFavoritesFromFavoritesStorageResult(result));

		let currentFeatureFlagsFromUrl = [];

		if (isAzurePortal(activeTabUrl)) {
			currentFeatureFlagsFromUrl = convertFeatureFlagsFromUrlToObject(getCurrentFeatureFlags(activeTabUrl));
			document.getElementById("navigateButton").innerText = "Apply";
			storedFeatureFlags.forEach(featureFlag => { featureFlag.isEnabled = false; });
		}
		else {
			document.getElementById("navigateButton").innerText = "Go!";
		}

		let userFeatureFlags = concatStoredAndCurrentFeatureFlags(storedFeatureFlags, currentFeatureFlagsFromUrl);
		userFeatureFlags.sort((ff1, ff2) => ff1.name.toLowerCase().localeCompare(ff2.name.toLowerCase()));
		userFeatureFlags.sort((ff1, ff2) => sortFeatureFlagByFavoriteStatus(ff1, ff2));

		userFeatureFlags.forEach((featureFlag, i) => {
			let isFeatureFlagIsTextValueType = !(featureFlagBooleanDefaultValues.includes(featureFlag.value.toLowerCase()));

			// add component
			let ffInitTextValue = isFeatureFlagIsTextValueType ? featureFlag.value : null;
			addFeatureFlag(ffInitTextValue);

			// update component input
			inputFeatureFlagEnabled(i + 1).checked = featureFlag.isEnabled;
			inputFeatureFlagName(i + 1).value = featureFlag.name;
			inputFeatureFlagValue(i + 1).value = ffInitTextValue ?? featureFlag.value.toLowerCase();
			
			inputFeatureFlagFavorite(i + 1).src = featureFlag.favoriteSrc;
			if (getInputFavoriteStatusFromComponent(i + 1) === "Full_Star") {
				inputFeatureFlagName(i + 1).disabled = true;
				enableFavoriteSaveChangesIcon(i + 1);
				updateSaveChangesIconIfNeeded(i + 1);
			}

			inputFeatureFlagName(i + 1).title = featureFlag.name;
			if (isFeatureFlagIsTextValueType) {
				inputFeatureFlagValue(i + 1).title = featureFlag.value;
			}
		});
	});
});

function calculateAndNavigateNewUrl()
{
	chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
		let activeTabUrl = tabs[0].url;

		let domain = "https://portal.azure.com";
		let urlSecondPart = "#home";

		if (isAzurePortal(activeTabUrl)) {
			domain = getAzurePortalDomain(activeTabUrl);
			urlSecondPart = getAzureService(activeTabUrl);
		}

		let featureFlags = [];
		for (let i = 1; i <= lastIndex; i++) {
			if (inputFeatureFlagEnabled(i)?.checked && inputFeatureFlagName(i).value.length > 0 && inputFeatureFlagValue(i).value.length > 0) {
				featureFlags.push(inputFeatureFlagName(i).value + "=" + inputFeatureFlagValue(i).value);
			}
		}

		let newFeatureFlags = featureFlags.length > 0 ? "?" + featureFlags.join("&") : "";

		if (isAzurePortal(activeTabUrl)) {
			updateCurrentTabUrl(domain + newFeatureFlags + urlSecondPart);
		}
		else {
			openUrlInNewTab(domain + newFeatureFlags + urlSecondPart);
		}

		window.close();
	});
}

function getAzurePortalDomain(url) {
	let domainIdentifier = "portal.azure";
	if (url.includes("df.onecloud.azure-test.net")) {
		domainIdentifier = "df.onecloud.azure-test.net";
	}

	return url.split(domainIdentifier)[0] + domainIdentifier + (url.split(domainIdentifier)[1] ?? ".com").split("/")[0] + "/";
}

function getAzureService(url) {
	if (!url.includes("#")) {
		return "#home";
	}

	return "#" + url.split("#")[1];
}

function getCurrentFeatureFlags(url) {
	let droppedDomainUrl = url.split(getAzurePortalDomain(url))[1] ?? "";
	let featureFlagsText = droppedDomainUrl.split(getAzureService(url))[0];

	if (featureFlagsText.length <= 1) {
		return [];
	}

	return (featureFlagsText.split("?")[1] ?? "").split("&");
}

function favoriteFeatureFlag(inputIndex) {
	let featureFlagStatus = getInputFavoriteStatusFromComponent(inputIndex);

	if (inputFeatureFlagName(inputIndex).value.length === 0 || inputFeatureFlagValue(inputIndex).value.length === 0) {
		validateRequiredField(inputFeatureFlagName(inputIndex));
		validateRequiredField(inputFeatureFlagValue(inputIndex));
		return;
	}

	getFavoritesFromStorage(function(result) {
		let storedFeatureFlags = getFavoritesFromFavoritesStorageResult(result);

		let favoritesIndex = -1;
		storedFeatureFlags.forEach((featureFlag, i) => {
			if (featureFlag.name === inputFeatureFlagName(inputIndex).value) {
				favoritesIndex = i;
			}
		});

		if (featureFlagStatus === "Empty_Star") { // upsert favorite feature flag
			let newStoredFeatureFlag = getFeatureFlagConfigurationFromInputComponent(inputIndex);

			if (favoritesIndex > -1) {
				storedFeatureFlags[favoritesIndex] = newStoredFeatureFlag;
			}
			else {
				storedFeatureFlags.push(newStoredFeatureFlag);
			}
		}
		else { // delete favorite feature flag
			if (favoritesIndex > -1) {
				storedFeatureFlags.splice(favoritesIndex, 1);
			}
		}

		saveFavoritesToStorage(storedFeatureFlags, () => {
			inputFeatureFlagName(inputIndex).disabled = featureFlagStatus === "Empty_Star" ? true : false;
			document.getElementById("ff" + inputIndex + "_saveChangesIcon").src = "/Images/Save_Disabled.png";
			toggleInputFavoriteFeatureFlag(inputIndex);
			toggleFavoriteFeatureFlagSaveChangesIcons(inputIndex);
			storageFeatureFlags = copyArray(storedFeatureFlags);
		});
	});
}

function updateFavoriteFeatureFlagConfiguration(inputIndex)
{
	if (getInputFavoriteStatusFromComponent(inputIndex) === "Empty_Star") {
		return;
	}

	if (inputFeatureFlagName(inputIndex).value.length === 0 || inputFeatureFlagValue(inputIndex).value.length === 0) {
		return;
	}

	getFavoritesFromStorage(function(result) {
		let storedFeatureFlags = getFavoritesFromFavoritesStorageResult(result);

		let newFavoriteConfiguration = getFeatureFlagConfigurationFromInputComponent(inputIndex);

		let favoriteFound = false;
		storedFeatureFlags.forEach(featureFlag => {
			if (featureFlag.name === newFavoriteConfiguration.name) {
				favoriteFound = true;
				featureFlag.isEnabled = newFavoriteConfiguration.isEnabled;
				featureFlag.value = newFavoriteConfiguration.value;
			}
		});

		if (favoriteFound) {
			saveFavoritesToStorage(storedFeatureFlags, () => {
				document.getElementById("ff" + inputIndex + "_saveChangesIcon").src = "/Images/Save_Disabled.png";
				storageFeatureFlags = copyArray(storedFeatureFlags);
			});
		}
	});
}

function getInputFavoriteStatusFromComponent(inputIndex)
{
	let inputFavoriteFF = inputFeatureFlagFavorite(inputIndex);
	let imagePathArray = inputFavoriteFF.src.split("/");
	return imagePathArray[imagePathArray.length - 1].split(".")[0];
}

function removeFeatureFlag(inputIndex)
{
	let inputContainerFeatureFlag = document.getElementById("ff" + inputIndex + "_removeContainer").parentNode;
	inputContainerFeatureFlag.parentNode.removeChild(inputContainerFeatureFlag);
}

function isAzurePortal(url)
{
	return url.includes("portal.azure") || url.includes("df.onecloud.azure-test.net");
}

function convertFeatureFlagsFromUrlToObject(featureFlags)
{
	return featureFlags.map(featureFlag => {
		let featureFlagSplitted = featureFlag.split("=");
		return {
			name: featureFlagSplitted[0],
			value: featureFlagSplitted[1],
			isEnabled: true,
			favoriteSrc: "/Images/Empty_Star.png"
		};
	});
}

function concatStoredAndCurrentFeatureFlags(storedFeatureFlags, currentFeatureFlags)
{
	let storedFFs = copyArray(storedFeatureFlags);
	let currentFFs = copyArray(currentFeatureFlags);

	storedFFs.forEach(currentFeatureFlag => {
		currentFeatureFlag.favoriteSrc = "/Images/Full_Star.png";
	});

	currentFFs.forEach(currentFeatureFlag => {
		let foundIndex = -1;
		storedFFs.forEach((storedFeatureFlag, i) => {
			if (storedFeatureFlag.name === currentFeatureFlag.name) {
				currentFeatureFlag.favoriteSrc = "/Images/Full_Star.png";
				foundIndex = i;
			}
		});
		if (foundIndex > -1) {
			storedFFs.splice(foundIndex, 1);
		}
	});

	return storedFFs.concat(currentFFs);
}

function sortFeatureFlagByFavoriteStatus(ff1, ff2) {
	if (ff1.favoriteSrc === "/Images/Full_Star.png" && ff2.favoriteSrc === "/Images/Empty_Star.png") {
		return -1;
	}

	if (ff1.favoriteSrc === "/Images/Empty_Star.png" && ff2.favoriteSrc === "/Images/Full_Star.png") {
		return 1;
	}

	return 0;
}

function addFeatureFlag(ffInitTextValue)
{
	lastIndex = lastIndex + 1;
	document.getElementById("featureFlagsList").appendChild(createFeatureFlagHtmlElement(lastIndex, ffInitTextValue));
}

function createFeatureFlagHtmlElement(inputIndex, ffInitTextValue)
{
	// container
	let featureFlagContainer = document.createElement("div");
	featureFlagContainer.className = "featureFlag_inputContainer";

	// enabled checkbox
	let isEnabledCheckboxContainer = document.createElement("div");
	isEnabledCheckboxContainer.className = "featureFlag_inputSmallElement";

	let isEnabledCheckbox = document.createElement("input");
	isEnabledCheckbox.id = "ff" + inputIndex + "_enabled";
	isEnabledCheckbox.type = "checkbox";
	isEnabledCheckbox.checked = "true";
	isEnabledCheckbox.addEventListener("change", () => updateSaveChangesIconIfNeeded(inputIndex));
	isEnabledCheckboxContainer.appendChild(isEnabledCheckbox);

	// feature flag name
	let inputContainer = document.createElement("div");
	inputContainer.className = "featureFlag_inputElement";

	let nameInput = document.createElement("input");
	nameInput.type = "text";
	nameInput.id = "ff" + inputIndex + "_name";
	nameInput.className = "featureFlag_nameInput";
	nameInput.addEventListener("keyup", () => changeTextInputComponent(inputFeatureFlagName(inputIndex)));
	inputContainer.appendChild(nameInput);

	// colon
	let colonContainer = document.createElement("div");
	colonContainer.className = "featureFlag_inputElement featureFlag_inputSmallElement";

	let colon = document.createTextNode(":");
	colonContainer.appendChild(colon);

	// feature flag value
	let valueContainer = document.createElement("div");
	valueContainer.className = "featureFlag_inputElement";

	let valueInput;
	if (ffInitTextValue) {
		valueInput = document.createElement("input");
		valueInput.type = "text";
		valueInput.className = "featureFlag_valueInputTextBox";
		valueInput.addEventListener("keyup", () => changeTextInputComponent(inputFeatureFlagValue(inputIndex)));
	}
	else {
		valueInput = document.createElement("select");
		valueInput.className = "featureFlag_valueInputDropDown";
		featureFlagBooleanDefaultValues.forEach(optionValue => {
			let dropDownOptionItem = document.createElement("option");
			dropDownOptionItem.value = optionValue;
			dropDownOptionItem.text = optionValue;
			valueInput.appendChild(dropDownOptionItem);
		});
	}
	valueInput.id = "ff" + inputIndex + "_val";
	valueInput.addEventListener("change", () => updateSaveChangesIconIfNeeded(inputIndex));
	valueContainer.appendChild(valueInput);

	// save changes to favorites
	let saveChangesContainer = document.createElement("div");
	saveChangesContainer.className = "featureFlag_clickableContainer";
	saveChangesContainer.style.display = "none";
	saveChangesContainer.id = "ff" + inputIndex + "_saveChangesContainer";
	saveChangesContainer.addEventListener("click", () => updateFavoriteFeatureFlagConfiguration(inputIndex));

	let saveIcon = document.createElement("img");
	saveIcon.id = "ff" + inputIndex + "_saveChangesIcon";
	saveIcon.src = "/Images/Save_Disabled.png";
	saveIcon.className = "featureFlag_buttonIcon";
	saveChangesContainer.appendChild(saveIcon);

	// delete
	let deleteContainer = document.createElement("div");
	deleteContainer.className = "featureFlag_clickableContainer featureFlag_removeContainer";
	deleteContainer.id = "ff" + inputIndex + "_removeContainer";
	deleteContainer.addEventListener("click", () => removeFeatureFlag(inputIndex));

	let deleteIcon = document.createElement("img");
	deleteIcon.src = "/Images/Trash_Can.png";
	deleteIcon.className = "featureFlag_removeIcon";
	deleteContainer.appendChild(deleteIcon);

	// favorites
	let favoritesContainer = document.createElement("div");
	favoritesContainer.className = "featureFlag_clickableContainer";

	let favorites = document.createElement("img");
	favorites.src = "/Images/Empty_Star.png";
	favorites.className = "featureFlag_buttonIcon";
	favorites.id = "ff" + inputIndex + "_favorite";
	favorites.addEventListener("click", () => favoriteFeatureFlag(inputIndex));
	favoritesContainer.appendChild(favorites);

	// append children
	featureFlagContainer.appendChild(isEnabledCheckboxContainer);
	featureFlagContainer.appendChild(inputContainer);
	featureFlagContainer.appendChild(colonContainer);
	featureFlagContainer.appendChild(valueContainer);
	featureFlagContainer.appendChild(saveChangesContainer);
	featureFlagContainer.appendChild(deleteContainer);
	featureFlagContainer.appendChild(favoritesContainer);

	return featureFlagContainer;
}

function updateSaveChangesIconIfNeeded(inputIndex)
{
	if (getInputFavoriteStatusFromComponent(inputIndex) !== "Full_Star") {
		return;
	}
	
	let rowFeatureFlag = getFeatureFlagConfigurationFromInputComponent(inputIndex);
	let storageFeatureFlagItem = storageFeatureFlags.find(featureFlag => featureFlag.name === rowFeatureFlag.name)

	if (storageFeatureFlagItem.isEnabled !== rowFeatureFlag.isEnabled || storageFeatureFlagItem.value !== rowFeatureFlag.value) {
		document.getElementById("ff" + inputIndex + "_saveChangesIcon").src = "/Images/Save.png";
	}
	else {
		document.getElementById("ff" + inputIndex + "_saveChangesIcon").src = "/Images/Save_Disabled.png";
	}
}

function changeTextInputComponent(textInputHtmlComponent)
{
	textInputHtmlComponent.title = textInputHtmlComponent.value;
	validateRequiredField(textInputHtmlComponent);
}

function validateRequiredField(textInputHtmlComponent) {
	if (textInputHtmlComponent.value.length > 0) {
		textInputHtmlComponent.classList.remove("requiredInput");
	} else {
		textInputHtmlComponent.classList.add("requiredInput");
	}
}

function toggleInputFavoriteFeatureFlag(inputIndex)
{
	let inputFavoriteFeatureFlag = inputFeatureFlagFavorite(inputIndex);

	if (inputFavoriteFeatureFlag.src.includes("Full_Star.png")) {
		inputFavoriteFeatureFlag.src = "/Images/Empty_Star.png";
	}
	else {
		inputFavoriteFeatureFlag.src = "/Images/Full_Star.png";
	}
}

function toggleFavoriteFeatureFlagSaveChangesIcons(inputIndex)
{
	if (getInputFavoriteStatusFromComponent(inputIndex) === "Full_Star") {
		enableFavoriteSaveChangesIcon(inputIndex);
	}
	else {
		document.getElementById("ff" + inputIndex + "_saveChangesContainer").style.display = "none";
		document.getElementById("ff" + inputIndex + "_removeContainer").style.display = "block";
	}
}

function enableFavoriteSaveChangesIcon(inputIndex)
{
	document.getElementById("ff" + inputIndex + "_saveChangesContainer").style.display = "block";
	document.getElementById("ff" + inputIndex + "_removeContainer").style.display = "none";
}

function copyArray(arrayToCopy)
{
	return arrayToCopy.map(item => Object.assign({}, item));
}

function getFeatureFlagConfigurationFromInputComponent(inputIndex)
{
	return {
		name: inputFeatureFlagName(inputIndex).value,
		value: inputFeatureFlagValue(inputIndex).value,
		isEnabled: inputFeatureFlagEnabled(inputIndex).checked
	};
}

// input elements
function inputFeatureFlagEnabled(inputIndex)
{
	return document.getElementById("ff" + inputIndex + "_enabled");
}

function inputFeatureFlagName(inputIndex)
{
	return document.getElementById("ff" + inputIndex + "_name");
}

function inputFeatureFlagValue(inputIndex)
{
	return document.getElementById("ff" + inputIndex + "_val");
}

function inputFeatureFlagFavorite(inputIndex)
{
	return document.getElementById("ff" + inputIndex + "_favorite");
}

// Chrome APIs
function saveFavoritesToStorage(featureFlagsToStore, onSavedCallback = () => {})
{
	chrome.storage.sync.set({["favorites"]: featureFlagsToStore}, onSavedCallback);
}

function getFavoritesFromStorage(onFetchedCallback)
{
	chrome.storage.sync.get("favorites", onFetchedCallback);
}

function getFavoritesFromFavoritesStorageResult(result)
{
	return result["favorites"] ?? [];
}

function updateCurrentTabUrl(newUrl)
{
	chrome.tabs.update(undefined, { url: newUrl });
}

function openUrlInNewTab(newUrl)
{
	chrome.tabs.create({ url: newUrl });
}
