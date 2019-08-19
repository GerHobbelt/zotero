const fs = require("fs");
const path = require("path");

const util = require("./util");
const handleError = require("./errors").handleError;
const config = require("./config").config;

// Okay, gotta do this from scratch.
// 1. Return array of jurisdictions depending on -j or -a


async function descriptiveToCompact(opts) {
	console.log("Reading descriptive jurisdiction files from: " + config.path.jurisSrcDir);
	console.log("Writing abbreviation files to: " + config.path.jurisAbbrevsDir);
	console.log("Writing compact jurisdiction files to: " + config.path.jurisMapDir);
	var jurisIDs = [];
	if (opts.a) {
		for (var fileName of fs.readdirSync(config.path.jurisSrcDir)) {
			var m = fileName.match(/^juris-(.*)-desc.json$/, "$1");
			if (m) {
				jurisIDs.push(m[1]);
			}
		}
	} else if (opts.j) {
		jurisIDs.push(opts.j)
	}
	if (jurisIDs.length === 0) {
		var e;
		if (opts.a) {
			e = new Error("no descriptive jurisdiction files found in " + config.path.jurisSrcDir);
		} else if (opts.j) {
			e = new Error("descriptive jurisdiction file does not exist in " + config.path.jurisSrcDir);
		}
		handleError(e);
	}
	
	for (var jurisID of jurisIDs) {
		// Call working code for a single jurisdiction here
		opts.j = jurisID;
		var jurisDesc = JSON.parse(fs.readFileSync(path.join(config.path.jurisSrcDir, "juris-" + jurisID + "-desc.json")).toString());

		// Abbreviation file(s)
		var abbrevVariantNames = getAbbrevVariantKeys(jurisDesc);
		for (var abbrevVariantName of abbrevVariantNames) {
			var fileName = getAbbrevFilename(jurisID, abbrevVariantName);
			var abbrevs = buildAbbrevs(jurisID, abbrevVariantName, jurisDesc);
			var label = abbrevVariantName ? jurisID + "/" + abbrevVariantName : jurisID;
			// write each abbreviation file
			var variantName = abbrevVariantName ? "-" + abbrevVariantName : "";
			var fileName = "auto-" + jurisID + variantName + ".json";
			fs.writeFileSync(path.join(config.path.jurisAbbrevsDir, fileName), JSON.stringify(abbrevs, null, 2));
		}
		// Compact file
		var compact = {
			jurisdictions: [],
			courtNames: [],
			countryCourtLinks: [],
			courts: [],
			courtJurisdictionLinks: []
		};
		var jurisdictionMap = {};
		for (var i=0,ilen=jurisDesc.jurisdictions.length; i<ilen; i++) {
			var jurisdiction = jurisDesc.jurisdictions[i];
			jurisdictionMap[getJurisdictionID(jurisdiction)] = i;
		}
		var hierarchyFail = false;
		for (var jurisdiction of jurisDesc.jurisdictions) {
			var info = [
				getJurisdictionTail(jurisdiction),
				jurisdiction.name
			];
			var parentID = getJurisdictionParent(jurisdictionMap, jurisdiction);
			if (parentID !== false) {
				info.push(parentID)
			}
			if ("undefined" === typeof info[2] && info[0] !== jurisID) {
				console.log("No parent found for "+JSON.stringify(info[0]));
				hierarchyFail = true;
			}
			compact.jurisdictions.push(info);
		}
		if (hierarchyFail) {
			console.log("Aborting due to nesting errors in " + path.join(config.path.jurisMapDir, "juris-" + jurisID + "-desc.json"));
			console.log("Rerun descriptive-to-compact after fixing the file");
			process.exit();
		}
		var courtIdxToIdMap = {};
		var courtIdToIdxMap = {};
		for (var courtID in jurisDesc.courts) {
			var court = jurisDesc.courts[courtID];
			courtIdxToIdMap[compact.courtNames.length] = courtID;
			courtIdToIdxMap[courtID] = compact.courtNames.length;
			compact.courtNames.push(court.name);
		}
		var countryCourtLink = {};
		var countryIdx = jurisdictionMap[getCountryNameOrID(jurisDesc, true)];
		for (var courtNameIdx=0,ilen=compact.courtNames.length; courtNameIdx<ilen; courtNameIdx++) {
			countryCourtLink[courtNameIdx + ":" + countryIdx] = compact.countryCourtLinks.length;
			compact.countryCourtLinks.push([courtNameIdx, countryIdx]);
		}
		// This could be folded into the loop above, since we're processing for
		// a single country in this function. But for clarity ...
		for (var courtNameIdx=0,ilen=compact.courtNames.length; courtNameIdx<ilen; courtNameIdx++) {
			var courtID = courtIdxToIdMap[courtNameIdx];
			var countryCourtLinkIdx = countryCourtLink[courtNameIdx + ":" + countryIdx];
			compact.courts.push([courtID, countryCourtLinkIdx]);
		}
		for (var jurisdiction of jurisDesc.jurisdictions) {
			var jurisdictionIdx = jurisdictionMap[getJurisdictionID(jurisdiction)];
			for (var courtID of jurisdiction.courts) {
				var courtIdx = courtIdToIdxMap[courtID];
				compact.courtJurisdictionLinks.push([jurisdictionIdx, courtIdx]);
			}
		}
		util.writeCompactData(opts, compact);
	}
	var plural = "s";
	var count = jurisIDs.length;
	if (count === 1) {
		plural = "";
	}
	console.log("Converted " + count + " jurisdiction" + plural + ": " + jurisIDs.join(", "));
}

function getAbbrevVariantKeys(jurisDesc) {
	var xtra = {};
	for (var courtKey in jurisDesc.courts) {
		var court = jurisDesc.courts[courtKey];
		for (var key in court) {
			if (key.slice(0, 7) === "abbrev:") {
				xtra[key.slice(7)] = true;
			}
		}
	}
	for (var jurisdiction of jurisDesc.jurisdictions) {
		for (var key in jurisdiction) {
			if (key.slice(0, 7) === "abbrev:") {
				xtra[key.slice(7)] = true;
			}
		}
	}
	return [false].concat(Object.keys(xtra));
}

function getAbbrevFilename(jurisID, abbrevVariantName) {
	var lst = ["auto"];
	lst.push(jurisID);
	if (abbrevVariantName) {
		lst.push(abbrevVariantName);
	}
	var fileName = lst.join("-") + ".json";
	return fileName;
}
	
function buildAbbrevs(jurisID, abbrevVariantName, jurisDesc) {
	var abbrevs = {
		filename: getAbbrevFilename(jurisID, abbrevVariantName),
		name: getCountryNameOrID(jurisDesc),
		version: util.getDateNow(),
		xdata: {
			"default": {
				place: {}
			}
		}
	}
	// Jurisdiction abbrevs
	var places = abbrevs.xdata["default"].place;
	for (var jurisdiction of jurisDesc.jurisdictions) {
		var id = getJurisdictionID(jurisdiction);
		var jurisdictionAbbrev = getBestAbbrev(jurisdiction, abbrevVariantName);
		places[id.toUpperCase()] = jurisdictionAbbrev;
		// Court abbrevs
		if (!abbrevs.xdata[id]) {
			abbrevs.xdata[id] = {
				"institution-part": {}
			};
		}
		for (var courtID of jurisdiction.courts) {
			var court = jurisDesc.courts[courtID];
			var courtAbbrev = getBestAbbrev(court, abbrevVariantName);
			var abbrev;
			if (courtAbbrev.slice(0, 1) === "<") {
				abbrev = jurisdictionAbbrev + courtAbbrev.slice(1);
			} else if (courtAbbrev.slice(-1) === ">") {
				abbrev = courtAbbrev.slice(0, -1) + jurisdictionAbbrev;
			} else {
				abbrev = courtAbbrev;
			}
			abbrevs.xdata[id]["institution-part"][courtID] = abbrev;
		}
	}
	return abbrevs;
}

function getBestAbbrev(obj, abbrevVariantName) {
	var abbrev;
	// Set name for abbrevVariantName key
	var abbrevVariantKey = "abbrev:" + abbrevVariantName;
	// and abbrev
	// and name
	// That's our fallback sequence.
	if (abbrevVariantName && obj[abbrevVariantKey]) {
		abbrev = obj[abbrevVariantKey];
	} else if (obj.abbrev) {
		abbrev = obj.abbrev;
	} else {
		abbrev = obj.name;
	}
	return abbrev;
}

function getCountryNameOrID(jurisDesc, returnID) {
	var name;
	for (var jurisdiction of jurisDesc.jurisdictions) {
		name = returnID ? jurisdiction.path : jurisdiction.name;
		if (jurisdiction.path.indexOf("/") === -1) {
			break;
		}
	}
	return name;
}

function getJurisdictionID(jurisdiction) {
	return jurisdiction.path.replace(/\//g, ":");
}

function getJurisdictionTail(jurisdiction) {
	return jurisdiction.path.split("/").slice(-1)[0];
}

function getJurisdictionParent(jurisdictionMap, jurisdiction) {
	if (jurisdiction.path.indexOf("/") === -1) {
		return false;
	}
	var parentID = jurisdiction.path.split("/").slice(0, -1).join(":");
	return jurisdictionMap[parentID];
}

module.exports = {
	descriptiveToCompact: descriptiveToCompact
}
