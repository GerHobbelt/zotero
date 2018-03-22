/*
    ***** BEGIN LICENSE BLOCK *****
    
    Copyright © 2009 Center for History and New Media
                     George Mason University, Fairfax, Virginia, USA
                     http://zotero.org
    
    This file is part of Zotero.
    
    Zotero is free software: you can redistribute it and/or modify
    it under the terms of the GNU Affero General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.
    
    Zotero is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU Affero General Public License for more details.
    
    You should have received a copy of the GNU Affero General Public License
    along with Zotero.  If not, see <http://www.gnu.org/licenses/>.
    
    ***** END LICENSE BLOCK *****
*/


/*
 * Small cache for jurisdiction and court names in use.
 */

Zotero.CachedJurisdictionData = new function() {
	var _jurisdictionIdToName = {};
	var _jurisdictionNameToId = {};
	var _courtIdToName = {};
	var _courtNameToId = {};
	var jurisdictionFieldID = null;
	var courtFieldID = null;

	this.jurisdictionNameFromId = jurisdictionNameFromId;
	this.courtNameFromId = courtNameFromId;
	this.courtIdFromName = courtIdFromName;
	
	this.init = function() {
		// Get jurisdiction and court fieldIDs
		jurisdictionFieldID = Zotero.ItemFields.getID('jurisdiction');
		courtFieldID = Zotero.ItemFields.getID('court');
	}

	this.load = Zotero.Promise.coroutine(function* (item) {
		var jurisdictionID, courtID;
		// Aha. Need to load names of all parent jurisdictions here.
		if (item.getField) {
			jurisdictionID = item.getField("jurisdiction", true);
		} else {
			jurisdictionID = item["jurisdiction"];
		}
		if (jurisdictionID) {
			var jurisdictions = jurisdictionID.split(":");
			for (var i=jurisdictions.length; i>0; i--) {
				var jurisdiction = jurisdictions.slice(0,i).join(":");
				yield this.setJurisdictionByIdOrName(jurisdiction);
			}
			if (item.getField) {
				courtID = item.getField("court", true);
			} else {
				courtID = item["court"];
			}
			if (_jurisdictionIdToName[jurisdictionID] && courtID) {
				Zotero.debug("XXX set court! With " + jurisdictionID+ " and " + courtID);
				yield this.setCourt(jurisdictionID, courtID);
			} else {
				Zotero.debug("XXX OH! no segment? " + !!_jurisdictionIdToName[jurisdictionID] + " or " + courtID);
			}
		}
	});
	
	this.setJurisdictionByIdOrName = Zotero.Promise.coroutine(function* (idOrName) {
		var id = idOrName;
		if (_jurisdictionNameToId[idOrName]) {
			id = _jurisdictionNameToId[idOrName];
		} else if (_jurisdictionIdToName[idOrName]) {
			id = idOrName;
		} else {
			var sql = "SELECT jurisdictionID,jurisdictionName FROM jurisdictions WHERE jurisdictionID=?";
			var row = yield Zotero.DB.rowQueryAsync(sql, [idOrName]);
			if (!row) {
				sql = "SELECT jurisdictionID,jurisdictionName FROM jurisdictions WHERE jurisdictionName=?";
				row = yield Zotero.DB.rowQueryAsync(sql, [idOrName]);
			}
			if (row) {
				id = row.jurisdictionID;
				var longName = row.jurisdictionName;
				var shortName = longName;
				if (longName.split("|").length > 2) {
					// Sans full country name, in other words.
					shortName = longName.slice(longName.indexOf("|") + 1);
				}
				_jurisdictionIdToName[id] = {
					name: longName,
					shortName: shortName
				};
				// This is correct. Incoming jurisdictions to this function,
				// if a subjurisdiction, have the full country name in first position,
				// followed by the (uppercase) country code. shortName
				// just strips off the full name -- there is no data loss.
				_jurisdictionNameToId[shortName] = id;
			}
		}
		return id;
	});

	function jurisdictionNameFromId (id, longForm, strict) {
		if (_jurisdictionIdToName[id]) {
			if (longForm) {
				return _jurisdictionIdToName[id].name;
			} else {
				return _jurisdictionIdToName[id].shortName;
			}
		} else if (strict) {
			return false;
		} else {
			return id;
		}
	};

	this.setCourt = Zotero.Promise.coroutine(function* (jurisdictionID, courtIdOrName) {
		let sql = "SELECT courtID,courtName FROM jurisdictions JU "
			+ "JOIN courtJurisdictionLinks CJL USING(jurisdictionIdx) "
			+ "JOIN courts USING(courtIdx) "
			+ "JOIN countryCourtLinks CCL USING(countryCourtLinkIdx) "
			+ "JOIN courtNames CN USING(courtNameIdx) "
			+ "JOIN jurisdictions CO ON CO.jurisdictionIdx=CCL.countryIdx "
			+ "WHERE (courtID=? OR CN.courtName=?) AND JU.jurisdictionID=? AND CO.jurisdictionID=?"
		var countryID = jurisdictionID.split(':')[0];
		let row = yield Zotero.DB.rowQueryAsync(sql, [
			courtIdOrName,
			courtIdOrName,
			jurisdictionID,
			countryID
		]);
		Zotero.debug("XXX got name! " + row.courtID + " " + row.courtName);
		var courtName = row.courtName;
		var courtID = row.courtID
		if (courtName) {
			if (!_courtIdToName[jurisdictionID]) {
				_courtIdToName[jurisdictionID] = {};
			}
			_courtIdToName[jurisdictionID][courtID] = courtName;
			
			if (!_courtNameToId[jurisdictionID]) {
				_courtNameToId[jurisdictionID] = {};
			}
			_courtNameToId[jurisdictionID][courtName] = courtID;
		}
	});

	function courtNameFromId(JID, id, strict) {
		if (_courtIdToName[JID] && _courtIdToName[JID][id]) {
			return _courtIdToName[JID][id];
		}
		else if (strict) {
			return false;
		} else {
			return id;
		}
	}

	function courtIdFromName(JID, name, strict) {
		if (_courtNameToId[JID] && _courtNameToId[JID][name]) {
			return _courtNameToId[JID][name];
		}
		else if (!strict) {
			return name;
		}
		return false;
	}
}
