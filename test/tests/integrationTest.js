"use strict";

describe("Zotero.Integration", function () {
	Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");
	const INTEGRATION_TYPE_ITEM = 1;
	const INTEGRATION_TYPE_BIBLIOGRAPHY = 2;
	const INTEGRATION_TYPE_TEMP = 3;
	/**
	 * To be used as a reference for Zotero-Word Integration plugins
	 * 
	 * NOTE: Functions must return promises instead of values!
	 * The functions defined for the dummy are promisified below
	 */
	var DocumentPluginDummy = {};

	/**
	 * The Application class corresponds to a word processing application.
	 */
	DocumentPluginDummy.Application = function() { 
		this.doc = new DocumentPluginDummy.Document();
		this.primaryFieldType = "Field";
		this.secondaryFieldType = "Bookmark";
		this.supportedNotes = ['footnotes', 'endnotes'];
		this.fields = [];
	};
	DocumentPluginDummy.Application.prototype = {
		/**
		 * Gets the active document.
		 * @returns {DocumentPluginDummy.Document}
		 */
		getActiveDocument: function() {return this.doc},
		/**
		 * Gets the document by some app-specific identifier.
		 * @param {String|Number} docID
		 */
		getDocument: function(docID) {return this.doc},
		QueryInterface: function() {return this},
	};

	/**
	 * The Document class corresponds to a single word processing document.
	 */
	DocumentPluginDummy.Document = function() {this.fields = []};
	DocumentPluginDummy.Document.prototype = {
		/**
		 * Displays a dialog in the word processing application
		 * @param {String} dialogText
		 * @param {Number} icon - one of the constants defined in integration.js for dialog icons
		 * @param {Number} buttons - one of the constants defined in integration.js for dialog buttons
		 * @returns {Number}
		 *		 - Yes: 2, No: 1, Cancel: 0
		 *		 - Yes: 1, No: 0
		 *		 - Ok: 1, Cancel: 0
		 *		 - Ok: 0
		 */
		displayAlert: (dialogText, icon, buttons) => 0,
		/**
		 * Brings this document to the foreground (if necessary to return after displaying a dialog)
		 */
		activate: () => 0,
		/**
		 * Determines whether a field can be inserted at the current position.
		 * @param {String} fieldType
		 * @returns {Boolean}
		 */
		canInsertField: (fieldType) => true,
		/**
		 * Returns the field in which the cursor resides, or NULL if none.
		 * @param {String} fieldType
		 * @returns {Boolean}
		 */
		cursorInField: (fieldType) => false,
		/**
		 * Get document data property from the current document
		 * @returns {String}
		 */
		getDocumentData: function() {return this.data},
		/**
		 * Set document data property
		 * @param {String} data
		 */
		setDocumentData: function(data) {this.data = data},
		/**
		 * Inserts a field at the given position and initializes the field object.
		 * @param {String} fieldType
		 * @param {Integer} noteType
		 * @returns {DocumentPluginDummy.Field}
		 */
		insertField: function(fieldType, noteType) { 
			if (typeof noteType != "number") {
				throw new Error("noteType must be an integer");
			}
			var field = new DocumentPluginDummy.Field(this); 
			this.fields.push(field);
			return field;
		},
		/**
		 * Gets all fields present in the document.
		 * @param {String} fieldType
		 * @returns {DocumentPluginDummy.Field[]}
		 */
		getFields: function(fieldType) {return Array.from(this.fields)},
		/**
		 * Sets the bibliography style, overwriting the current values for this document
		 */
		setBibliographyStyle: (firstLineIndent, bodyIndent, lineSpacing, entrySpacing,
			tabStops, tabStopsCount) => 0,
		/**
		 * Converts all fields in a document to a different fieldType or noteType
		 * @params {DocumentPluginDummy.Field[]} fields
		 */
		convert: (fields, toFieldType, toNoteType, count) => 0,
		/**
		 * Cleans up the document state and resumes processor for editing
		 */
		cleanup: () => 0,

		/**
		 * Informs the document processor that the operation is complete
		 */
		complete: () => 0,
	};

	/**
	 * The Field class corresponds to a field containing an individual citation
	 * or bibliography
	 */
	DocumentPluginDummy.Field = function(doc) {
		this.doc = doc;
		this.code = '';
		// This is actually required and current integration code depends on text being non-empty upon insertion.
		// insertBibliography will fail if there is no placeholder text.
		this.text = '{Placeholder}';
		this.wrappedJSObject = this;
	};
	DocumentPluginDummy.Field.noteIndex = 0;
	DocumentPluginDummy.Field.prototype = {
		/**
		 * Deletes this field and its contents.
		 */
		delete: function() {this.doc.fields.filter((field) => field !== this)},
		/**
		 * Removes this field, but maintains the field's contents.
		 */
		removeCode: function() {this.code = ""},
		/**
		 * Selects this field.
		 */
		select: () => 0,
		/**
		 * Sets the text inside this field to a specified plain text string or pseudo-RTF formatted text
		 * string.
		 * @param {String} text
		 * @param {Boolean} isRich
		 */
		setText: function(text, isRich) {this.text = text},
		/**
		 * Gets the text inside this field, preferably with formatting, but potentially without
		 * @returns {String}
		 */
		getText: function() {return this.text},
		/**
		 * Sets field's code
		 * @param {String} code
		 */
		setCode: function(code) {this.code = code},
		/**
		 * Gets field's code.
		 * @returns {String}
		 */
		getCode: function() {return this.code},
		/**
		 * Returns true if this field and the passed field are actually references to the same field.
		 * @param {DocumentPluginDummy.Field} field
		 * @returns {Boolean}
		 */
		equals: function(field) {return this == field},
		/**
		 * This field's note index, if it is in a footnote or endnote; otherwise zero.
		 * @returns {Number}
		 */
		getNoteIndex: () => 0,
	};

	// Processing functions for logging and promisification
	for (let cls of ['Application', 'Document', 'Field']) {
		for (let methodName in DocumentPluginDummy[cls].prototype) {
			if (methodName !== 'QueryInterface') {
				let method = DocumentPluginDummy[cls].prototype[methodName];
				DocumentPluginDummy[cls].prototype[methodName] = async function() {
					try {
						Zotero.debug(`DocumentPluginDummy: ${cls}.${methodName} invoked with args ${JSON.stringify(arguments)}`, 2);
					} catch (e) {
						Zotero.debug(`DocumentPluginDummy: ${cls}.${methodName} invoked with args ${arguments}`, 2);
					}
					var result = method.apply(this, arguments);
					try {
						Zotero.debug(`Result: ${JSON.stringify(result)}`, 2);
					} catch (e) {
						Zotero.debug(`Result: ${result}`, 2);
					}
					return result;
				}
			}
		}
	}
	
	var testItems;
	var applications = {};
	var addEditCitationSpy, displayDialogStub;
	var styleID = "http://www.zotero.org/styles/cell";
	var stylePath = OS.Path.join(getTestDataDirectory().path, 'cell.csl');

	var commandList = [
		'addCitation', 'editCitation', 'addEditCitation',
		'addBibliography', 'editBibliography', 'addEditBibliography',
		'refresh', 'removeCodes', 'setDocPrefs'
	];
	
	function execCommand(command, docID) {
		if (! commandList.includes(command)) {
			throw new Error(`${command} is not a valid document command`);
		}
		if (typeof docID === "undefined") {
			throw new Error(`docID cannot be undefined`)
		}
		Zotero.debug(`execCommand '${command}': ${docID}`, 2);
		return Zotero.Integration.execCommand("dummy", command, docID);
	}
	
	var dialogResults = {
		addCitationDialog: {},
		quickFormat: {},
		integrationDocPrefs: {},
		selectItemsDialog: {},
		editBibliographyDialog: {}
	};
	
	async function initDoc(docID, options={}) {
		applications[docID] = new DocumentPluginDummy.Application();
		var data = new Zotero.Integration.DocumentData();
		data.prefs = {
			noteType: 0,
			fieldType: "Field",
			automaticJournalAbbreviations: true
		};
		data.style = {styleID, locale: 'en-US', hasBibliography: true, bibliographyStyleHasBeenSet: true};
		data.sessionID = Zotero.Utilities.randomString(10);
		Object.assign(data, options);
		await (await applications[docID].getDocument(docID)).setDocumentData(data.serialize());
	}
	
	function setDefaultIntegrationDocPrefs() {
		dialogResults.integrationDocPrefs = {
			style: "http://www.zotero.org/styles/cell",
			locale: 'en-US',
			fieldType: 'Field',
			automaticJournalAbbreviations: false,
			useEndnotes: 0
		};
	}
	setDefaultIntegrationDocPrefs();
	
	function setAddEditItems(items) {
		if (items.length == undefined) items = [items];
		dialogResults.quickFormat = async function(dialogName, io) {
			io.citation.citationItems = items.map(function(item) {
				item = Zotero.Cite.getItem(item.id);
				return {id: item.id, uris: item.cslURIs, itemData: item.cslItemData};
			});
			await io.previewFn(io.citation);
			io._acceptDeferred.resolve(() => {});
		};
	}
	
	before(function* () {
		yield Zotero.Styles.init();
		yield Zotero.Styles.install({file: stylePath}, styleID, true);

		testItems = [];
		for (let i = 0; i < 5; i++) {
			let testItem = yield createDataObject('item', {libraryID: Zotero.Libraries.userLibraryID});
			testItem.setField('title', `title${1}`);
			testItem.setCreator(0, {creatorType: 'author', name: `Author No${i}`, multi: {_key:{}}});
			testItems.push(testItem);
		}
		setAddEditItems(testItems[0]);
		
		sinon.stub(Zotero.Integration, 'getApplication').callsFake(function(agent, command, docID) {
			if (!applications[docID]) {
				applications[docID] = new DocumentPluginDummy.Application();
			}
			return applications[docID];
		});
		
		displayDialogStub = sinon.stub(Zotero.Integration, 'displayDialog');
		displayDialogStub.callsFake(async function(dialogName, prefs, io) {
			Zotero.debug(`Display dialog: ${dialogName}`, 2);
			var ioResult = dialogResults[dialogName.substring(dialogName.lastIndexOf('/')+1, dialogName.length-4)];
			if (typeof ioResult == 'function') {
				await ioResult(dialogName, io);
			} else {
				Object.assign(io, ioResult);
			}
		});
		
		addEditCitationSpy = sinon.spy(Zotero.Integration.Interface.prototype, 'addEditCitation');
		
		sinon.stub(Zotero.Integration.Progress.prototype, 'show');
	});
	
	after(function() {
		Zotero.Integration.Progress.prototype.show.restore();
		Zotero.Integration.getApplication.restore();
		displayDialogStub.restore();
		addEditCitationSpy.restore();
	});
	
	describe('Interface', function() {
		describe('#execCommand', function() {
			var setDocumentDataSpy;
			var docID = this.fullTitle();
			
			before(function() {
				setDocumentDataSpy = sinon.spy(DocumentPluginDummy.Document.prototype, 'setDocumentData');
			});
			
			afterEach(function() {
				setDocumentDataSpy.reset();
			});
			
			after(function() {
				setDocumentDataSpy.restore();
			});
			
			it('should call doc.setDocumentData once', function* () {
				yield execCommand('addEditCitation', docID);
				assert.isTrue(setDocumentDataSpy.calledOnce);
			});
			
			describe('when style used in the document does not exist', function() {
				var docID = this.fullTitle();
				var displayAlertStub;
				var style;
				before(function* () {
					displayAlertStub = sinon.stub(DocumentPluginDummy.Document.prototype, 'displayAlert').resolves(0);
				});
				
				beforeEach(async function () {
					// 🦉birds?
					style = {styleID: "http://www.example.com/csl/waterbirds", locale: 'en-US'};
					
					// Make sure style not in library
					try {
						Zotero.Styles.get(style.styleID).remove();
					} catch (e) {}
					await initDoc(docID, {style});
					displayDialogStub.resetHistory();
					displayAlertStub.reset();
				});
				
				after(function* () {
					displayAlertStub.restore();
				});
			
				describe('when the style is not from a trusted source', function() {
					it('should download the style and if user clicks YES', function* () {
						var styleInstallStub = sinon.stub(Zotero.Styles, "install").resolves({
							styleTitle: 'Waterbirds',
							styleID: 'waterbirds'
						});
						var style = Zotero.Styles.get(styleID);
						var styleGetCalledOnce = false;
						var styleGetStub = sinon.stub(Zotero.Styles, 'get').callsFake(function() {
							if (!styleGetCalledOnce) {
								styleGetCalledOnce = true;
								return false;
							}
							return style;
						});
						displayAlertStub.resolves(1);
						yield execCommand('addEditCitation', docID);
						assert.isTrue(displayAlertStub.calledOnce);
						assert.isFalse(displayDialogStub.calledWith(applications[docID].doc, 'chrome://zotero/content/integration/integrationDocPrefs.xul'));
						assert.isTrue(styleInstallStub.calledOnce);
						assert.isOk(Zotero.Styles.get(style.styleID));
						styleInstallStub.restore();
						styleGetStub.restore();
					});
					
					it('should prompt with the document preferences dialog if user clicks NO', function* () {
						displayAlertStub.resolves(0);
						yield execCommand('addEditCitation', docID);
						assert.isTrue(displayAlertStub.calledOnce);
						// Prefs to select a new style and quickFormat
						assert.isTrue(displayDialogStub.calledTwice);
						assert.isNotOk(Zotero.Styles.get(style.styleID));
					});	
				});
					
				it('should download the style without prompting if it is from zotero.org', function* (){
					yield initDoc(docID, {styleID: "http://www.zotero.org/styles/waterbirds", locale: 'en-US'});
					var styleInstallStub = sinon.stub(Zotero.Styles, "install").resolves({
						styleTitle: 'Waterbirds',
						styleID: 'waterbirds'
					});
					var style = Zotero.Styles.get(styleID);
					var styleGetCalledOnce = false;
					var styleGetStub = sinon.stub(Zotero.Styles, 'get').callsFake(function() {
						if (!styleGetCalledOnce) {
							styleGetCalledOnce = true;
							return false;
						}
						return style;
					});
					displayAlertStub.resolves(1);
					yield execCommand('addEditCitation', docID);
					assert.isFalse(displayAlertStub.called);
					assert.isFalse(displayDialogStub.calledWith(applications[docID].doc, 'chrome://zotero/content/integration/integrationDocPrefs.xul'));
					assert.isTrue(styleInstallStub.calledOnce);
					assert.isOk(Zotero.Styles.get(style.styleID));
					styleInstallStub.restore();
					styleGetStub.restore();	
				});
			});
		});
		
		describe('#addEditCitation', function() {
			var insertMultipleCitations = Zotero.Promise.coroutine(function *() {
				var docID = this.test.fullTitle();
				if (!(docID in applications)) yield initDoc(docID);
				var doc = applications[docID].doc;

				setAddEditItems(testItems[0]);
				yield execCommand('addEditCitation', docID);
				assert.equal(doc.fields.length, 1);
				var citation = yield (new Zotero.Integration.CitationField(doc.fields[0], doc.fields[0].code)).unserialize();
				assert.equal(citation.citationItems.length, 1);
				assert.equal(citation.citationItems[0].id, testItems[0].id);

				setAddEditItems(testItems.slice(1, 3));
				yield execCommand('addEditCitation', docID);
				assert.equal(doc.fields.length, 2);
				citation = yield (new Zotero.Integration.CitationField(doc.fields[1], doc.fields[1].code)).unserialize();
				assert.equal(citation.citationItems.length, 2);
				for (let i = 1; i < 3; i++) {
					assert.equal(citation.citationItems[i-1].id, testItems[i].id);
				}
			});
			it('should insert citation if not in field', insertMultipleCitations);

			it('should edit citation if in citation field', function* () {
				yield insertMultipleCitations.call(this);
				var docID = this.test.fullTitle();
				var doc = applications[docID].doc;

				sinon.stub(doc, 'cursorInField').resolves(doc.fields[0]);
				sinon.stub(doc, 'canInsertField').resolves(false);

				setAddEditItems(testItems.slice(3, 5));
				yield execCommand('addEditCitation', docID);
				assert.equal(doc.fields.length, 2);
				var citation = yield (new Zotero.Integration.CitationField(doc.fields[0], doc.fields[0].code)).unserialize();
				assert.equal(citation.citationItems.length, 2);
				assert.equal(citation.citationItems[0].id, testItems[3].id);
			});
			
			it('should write an implicitly updated citation into the document', function* () {
				yield insertMultipleCitations.call(this);
				var docID = this.test.fullTitle();
				var doc = applications[docID].doc;

				testItems[3].setCreator(0, {creatorType: 'author', lastName: 'Smith', firstName: 'Robert', multi:{_key: {}}});
				testItems[3].setField('date', '2019-01-01');

				setAddEditItems(testItems[3]);
				yield execCommand('addEditCitation', docID);
				assert.equal(doc.fields[2].text, "(Smith, 2019)");

				sinon.stub(doc, 'cursorInField').resolves(doc.fields[0]);
				sinon.stub(doc, 'canInsertField').resolves(false);

				testItems[4].setCreator(0, {creatorType: 'author', lastName: 'Smith', firstName: 'Robert', multi:{_key: {}}});
				testItems[4].setField('date', '2019-01-01');

				setAddEditItems(testItems[4]);
				yield execCommand('addEditCitation', docID);
				assert.equal(doc.fields.length, 3);
				assert.equal(doc.fields[0].text, "(Smith, 2019a)");
				assert.equal(doc.fields[2].text, "(Smith, 2019b)");
			});

			it('should place an implicitly updated citation correctly after multiple new insertions', function* () {
				yield insertMultipleCitations.call(this);
				var docID = this.test.fullTitle();
				var doc = applications[docID].doc;

				testItems[3].setCreator(0, {creatorType: 'author', lastName: 'Smith', firstName: 'Robert', multi:{_key: {}}});
				testItems[3].setField('date', '2019-01-01');

				setAddEditItems(testItems[3]);
				yield execCommand('addEditCitation', docID);
				assert.equal(doc.fields[2].text, "(Smith, 2019)");

				sinon.stub(doc, 'cursorInField').resolves(doc.fields[0]);
				sinon.stub(doc, 'canInsertField').resolves(false);

				doc.fields[1].code = doc.fields[0].code;
				doc.fields[1].text = doc.fields[0].text;

				testItems[4].setCreator(0, {creatorType: 'author', lastName: 'Smith', firstName: 'Robert', multi:{_key: {}}});
				testItems[4].setField('date', '2019-01-01');

				setAddEditItems(testItems[4]);
				yield execCommand('addEditCitation', docID);
				assert.equal(doc.fields.length, 3);
				assert.equal(doc.fields[0].text, "(Smith, 2019a)");
				assert.equal(doc.fields[2].text, "(Smith, 2019b)");
			});

			it('should update bibliography if present', function* () {
				yield insertMultipleCitations.call(this);
				var docID = this.test.fullTitle();
				var doc = applications[docID].doc;
				
				let getCiteprocBibliographySpy =
					sinon.spy(Zotero.Integration.Bibliography.prototype, 'getCiteprocBibliography');
					
				yield execCommand('addEditBibliography', docID);
				assert.isTrue(getCiteprocBibliographySpy.calledOnce);
				
				assert.equal(getCiteprocBibliographySpy.lastCall.returnValue[0].entry_ids.length, 3);
				getCiteprocBibliographySpy.reset();

				setAddEditItems(testItems[3]);
				yield execCommand('addEditCitation', docID);
				assert.equal(getCiteprocBibliographySpy.lastCall.returnValue[0].entry_ids.length, 4);

				getCiteprocBibliographySpy.restore();
			});

			it('should update bibliography sort order on change to item', function* () {
				yield insertMultipleCitations.call(this);
				var docID = this.test.fullTitle();
				var doc = applications[docID].doc;

				let getCiteprocBibliographySpy =
					sinon.spy(Zotero.Integration.Bibliography.prototype, 'getCiteprocBibliography');

				yield execCommand('addEditBibliography', docID);
				assert.isTrue(getCiteprocBibliographySpy.calledOnce);

				assert.equal(getCiteprocBibliographySpy.lastCall.returnValue[0].entry_ids.length, 3);
				getCiteprocBibliographySpy.reset();

				sinon.stub(doc, 'cursorInField').resolves(doc.fields[1]);
				sinon.stub(doc, 'canInsertField').resolves(false);

				testItems[1].setCreator(0, {creatorType: 'author', name: 'Aaaaa', multi:{_key: {}}});
				testItems[1].setField('title', 'Bbbbb');

				setAddEditItems(testItems.slice(1, 3));
				yield execCommand('addEditCitation', docID);

				assert.equal(getCiteprocBibliographySpy.lastCall.returnValue[0].entry_ids.length, 3);
				assert.equal(getCiteprocBibliographySpy.lastCall.returnValue[1][0], "Aaaaa Bbbbb.");

				getCiteprocBibliographySpy.restore();
			});
			
			describe('when original citation text has been modified', function() {
				var displayAlertStub;
				before(function* () {
					displayAlertStub = sinon.stub(DocumentPluginDummy.Document.prototype, 'displayAlert').resolves(0);
				});	
				beforeEach(function() {
					displayAlertStub.reset();
				});
				after(function() {
					displayAlertStub.restore();
				});
				it('should keep modification if "Cancel" selected in editCitation triggered alert', async function () {
					await insertMultipleCitations.call(this);
					var docID = this.test.fullTitle();
					var doc = applications[docID].doc;

					doc.fields[0].text = "modified";
					sinon.stub(doc, 'cursorInField').resolves(doc.fields[0]);
					sinon.stub(doc, 'canInsertField').resolves(false);

					await execCommand('addEditCitation', docID);
					assert.equal(doc.fields.length, 2);
					assert.equal(doc.fields[0].text, "modified");
				});
				it('should display citation dialog if "OK" selected in editCitation triggered alert', async function () {
					await insertMultipleCitations.call(this);
					var docID = this.test.fullTitle();
					var doc = applications[docID].doc;

					let origText = doc.fields[0].text;
					doc.fields[0].text = "modified";
					// Return OK
					displayAlertStub.resolves(1);
					sinon.stub(doc, 'cursorInField').resolves(doc.fields[0]);
					sinon.stub(doc, 'canInsertField').resolves(false);
					setAddEditItems(testItems[0]);

					await execCommand('addEditCitation', docID);
					assert.isTrue(displayAlertStub.called);
					assert.equal(doc.fields.length, 2);
					assert.equal(doc.fields[0].text, origText);
				});
				it('should set dontUpdate: true if "yes" selected in refresh prompt', async function() {
					await insertMultipleCitations.call(this);
					var docID = this.test.fullTitle();
					var doc = applications[docID].doc;

					var citation = await (new Zotero.Integration.CitationField(doc.fields[0], doc.fields[0].code)).unserialize();
					assert.isNotOk(citation.properties.dontUpdate);
					doc.fields[0].text = "modified";
					// Return Yes
					displayAlertStub.resolves(1);

					await execCommand('refresh', docID);
					assert.isTrue(displayAlertStub.called);
					assert.equal(doc.fields.length, 2);
					assert.equal(doc.fields[0].text, "modified");
					var citation = await (new Zotero.Integration.CitationField(doc.fields[0], doc.fields[0].code)).unserialize();
					assert.isOk(citation.properties.dontUpdate);
				});
				it('should reset citation text if "no" selected in refresh prompt', async function() {
					await insertMultipleCitations.call(this);
					var docID = this.test.fullTitle();
					var doc = applications[docID].doc;

					var citation = await (new Zotero.Integration.CitationField(doc.fields[0], doc.fields[0].code)).unserialize();
					assert.isNotOk(citation.properties.dontUpdate);
					let origText = doc.fields[0].text;
					doc.fields[0].text = "modified";
					// Return No
					displayAlertStub.resolves(0);

					await execCommand('refresh', docID);
					assert.isTrue(displayAlertStub.called);
					assert.equal(doc.fields.length, 2);
					assert.equal(doc.fields[0].text, origText);
					var citation = await (new Zotero.Integration.CitationField(doc.fields[0], doc.fields[0].code)).unserialize();
					assert.isNotOk(citation.properties.dontUpdate);
				});
			});
			
			describe('when there are copy-pasted citations', function() {
				it('should resolve duplicate citationIDs and mark both as new citations', async function() {
					var docID = this.test.fullTitle();
					if (!(docID in applications)) initDoc(docID);
					var doc = applications[docID].doc;

					setAddEditItems(testItems[0]);
					await execCommand('addEditCitation', docID);
					assert.equal(doc.fields.length, 1);
					// Add a duplicate
					doc.fields.push(new DocumentPluginDummy.Field(doc));
					doc.fields[1].code = doc.fields[0].code;
					doc.fields[1].text = doc.fields[0].text;
					
					var originalUpdateDocument = Zotero.Integration.Fields.prototype.updateDocument;
					var stubUpdateDocument = sinon.stub(Zotero.Integration.Fields.prototype, 'updateDocument');
					try {
						var indicesLength;
						stubUpdateDocument.callsFake(function() {
							indicesLength = Object.keys(Zotero.Integration.currentSession.newIndices).length;
							return originalUpdateDocument.apply(this, arguments);
						});

						setAddEditItems(testItems[1]);
						await execCommand('addEditCitation', docID);
						assert.equal(indicesLength, 3);
					} finally {
						stubUpdateDocument.restore();
					}
				});
				
				it('should successfully process citations copied in from another doc', async function() {
					var docID = this.test.fullTitle();
					if (!(docID in applications)) initDoc(docID);
					var doc = applications[docID].doc;

					setAddEditItems(testItems[0]);
					await execCommand('addEditCitation', docID);
					assert.equal(doc.fields.length, 1);
					doc.fields.push(new DocumentPluginDummy.Field(doc));
					// Add a "citation copied from somewhere else"
					// the content doesn't really matter, just make sure that the citationID is different
					var newCitationID = Zotero.Utilities.randomString();
					doc.fields[1].code = doc.fields[0].code;
					doc.fields[1].code = doc.fields[1].code.replace(/"citationID":"[A-Za-z0-9^"]*"/,
						`"citationID":"${newCitationID}"`);
					doc.fields[1].text = doc.fields[0].text;
					
					var originalUpdateDocument = Zotero.Integration.Fields.prototype.updateDocument;
					var stubUpdateDocument = sinon.stub(Zotero.Integration.Fields.prototype, 'updateDocument');
					try {
						var indices;
						stubUpdateDocument.callsFake(function() {
							indices = Object.keys(Zotero.Integration.currentSession.newIndices);
							return originalUpdateDocument.apply(this, arguments);
						});

						setAddEditItems(testItems[1]);
						await execCommand('addEditCitation', docID);
						assert.equal(indices.length, 2);
						assert.include(indices, '1');
						assert.include(indices, '2');
					} finally {
						stubUpdateDocument.restore();
					}
				});
			});
			
			describe('when delayCitationUpdates is set', function() {
				it('should insert a citation with wave underlining', function* (){
					yield insertMultipleCitations.call(this);
					var docID = this.test.fullTitle();
					var doc = applications[docID].doc;
					var data = new Zotero.Integration.DocumentData(doc.data);
					data.prefs.delayCitationUpdates = true;
					doc.data = data.serialize();
					
					var setTextSpy = sinon.spy(DocumentPluginDummy.Field.prototype, 'setText');
					setAddEditItems(testItems[3]);
					yield execCommand('addEditCitation', docID);
					assert.isTrue(setTextSpy.lastCall.args[0].includes('\\uldash'));
					
					setTextSpy.restore();
				});
				
				it('should not write to any other fields besides the one being updated', function* () {
					yield insertMultipleCitations.call(this);
					var docID = this.test.fullTitle();
					var doc = applications[docID].doc;
					var data = new Zotero.Integration.DocumentData(doc.data);
					data.prefs.delayCitationUpdates = true;
					doc.data = data.serialize();

					var setTextSpy = sinon.spy(DocumentPluginDummy.Field.prototype, 'setText');
					var setCodeSpy = sinon.spy(DocumentPluginDummy.Field.prototype, 'setCode');
					
					setAddEditItems(testItems[3]);
					yield execCommand('addEditCitation', docID);
					var field = setTextSpy.firstCall.thisValue;
					
					for (let i = 0; i < setTextSpy.callCount; i++) {
						assert.isTrue(yield field.equals(setTextSpy.getCall(i).thisValue));
					}

					for (let i = 0; i < setCodeSpy.callCount; i++) {
						assert.isTrue(yield field.equals(setCodeSpy.getCall(i).thisValue));
					}

					setTextSpy.restore();
					setCodeSpy.restore();
				})
			});
		});
		
		describe('#addEditBibliography', function() {
			var docID = this.fullTitle();
			beforeEach(function* () {
				yield initDoc(docID);
				yield execCommand('addEditCitation', docID);
			});
			
			it('should insert bibliography if no bibliography field present', function* () {
				displayDialogStub.resetHistory();
				yield execCommand('addEditBibliography', docID);
				assert.isFalse(displayDialogStub.called);
				var biblPresent = false;
				for (let i = applications[docID].doc.fields.length-1; i >= 0; i--) {
					let field = yield Zotero.Integration.Field.loadExisting(applications[docID].doc.fields[i]);
					if (field.type == INTEGRATION_TYPE_BIBLIOGRAPHY) {
						biblPresent = true;
						break;
					}
				}
				assert.isTrue(biblPresent);
			});
			
			it('should display the edit bibliography dialog if bibliography present', function* () {
				yield execCommand('addEditBibliography', docID);
				displayDialogStub.resetHistory();
				yield execCommand('addEditBibliography', docID);
				assert.isTrue(displayDialogStub.calledOnce);
				assert.isTrue(displayDialogStub.lastCall.args[0].includes('editBibliographyDialog'));
			});
		});
	});
	
	describe("DocumentData", function() {
		it('should properly unserialize old XML document data', function() {
			var serializedXMLData = "<data data-version=\"3\" zotero-version=\"5.0.SOURCE\"><session id=\"F0NFmZ32\"/><style id=\"http://www.zotero.org/styles/cell\" hasBibliography=\"1\" bibliographyStyleHasBeenSet=\"1\"/><prefs><pref name=\"fieldType\" value=\"ReferenceMark\"/><pref name=\"automaticJournalAbbreviations\" value=\"true\"/><pref name=\"noteType\" value=\"0\"/></prefs></data>";
			var data = new Zotero.Integration.DocumentData(serializedXMLData);
			var expectedData = {
				style: {
					styleID: 'http://www.zotero.org/styles/cell',
					locale: null,
					hasBibliography: true,
					bibliographyStyleHasBeenSet: true
				},
				prefs: {
					fieldType: 'ReferenceMark',
					automaticJournalAbbreviations: true,
					noteType: 0,
					extractingLibraryID: 0,
					extractingLibraryName: "",
					suppressTrailingPunctuation: false
				},
				sessionID: 'F0NFmZ32',
				zoteroVersion: '5.0.SOURCE',
				dataVersion: '3'
			};
			// Convert to JSON to remove functions from DocumentData object
			assert.equal(JSON.stringify(data), JSON.stringify(expectedData));
		});
		
		it('should properly unserialize JSON document data', function() {
			var expectedData = JSON.stringify({
				style: {
					styleID: 'http://www.zotero.org/styles/cell',
					locale: 'en-US',
					hasBibliography: true,
					bibliographyStyleHasBeenSet: true
				},
				prefs: {
					fieldType: 'ReferenceMark',
					automaticJournalAbbreviations: false,
					noteType: 0
				},
				sessionID: 'owl-sesh',
				zoteroVersion: '5.0.SOURCE',
				dataVersion: 4
			});
			var data = new Zotero.Integration.DocumentData(expectedData);
			// Convert to JSON to remove functions from DocumentData object
			assert.equal(JSON.stringify(data), expectedData);
		});
		
		it('should properly serialize document data to XML (data ver 3)', function() {
			sinon.spy(Zotero, 'debug');
			var data = new Zotero.Integration.DocumentData();
			data.sessionID = "owl-sesh";
			data.zoteroVersion = Zotero.version;
			data.dataVersion = 3;
			data.style = {
				styleID: 'http://www.zotero.org/styles/cell',
				locale: 'en-US',
				hasBibliography: false,
				bibliographyStyleHasBeenSet: true
			};
			data.prefs = {
				noteType: 1,
				fieldType: "Field",
				automaticJournalAbbreviations: true,
				extractingLibraryID: 0,
				extractingLibraryName: "",
				suppressTrailingPunctuation: false
			};
			
			var serializedData = data.serialize();
			// Make sure we serialized to XML here
			assert.equal(serializedData[0], '<');
			// Serialize and unserialize (above test makes sure unserialize works properly).
			var processedData = new Zotero.Integration.DocumentData(serializedData);
			
			// This isn't ideal, but currently how it works. Better serialization which properly retains types
			// coming with official 5.0 release.
			data.dataVersion = "3";

			// Convert to JSON to remove functions from DocumentData objects
			assert.equal(JSON.stringify(processedData), JSON.stringify(data));
			
			// Make sure we are not triggering debug traces in Utilities.htmlSpecialChars()
			assert.isFalse(Zotero.debug.calledWith(sinon.match.string, 1));
			Zotero.debug.restore();
		});
		
		it('should properly serialize document data to JSON (data ver 4)', function() {
			var data = new Zotero.Integration.DocumentData();
			// data version 4 triggers serialization to JSON
			// (e.g. when we've retrieved data from the doc and it was ver 4 already)
			data.dataVersion = 4;
			data.sessionID = "owl-sesh";
			data.style = {
				styleID: 'http://www.zotero.org/styles/cell',
				locale: 'en-US',
				hasBibliography: false,
				bibliographyStyleHasBeenSet: true
			};
			data.prefs = {
				noteType: 1,
				fieldType: "Field",
				automaticJournalAbbreviations: true
			};
			
			// Serialize and unserialize (above tests makes sure unserialize works properly).
			var processedData = new Zotero.Integration.DocumentData(data.serialize());

			// Added in serialization routine
			data.zoteroVersion = Zotero.version;
			
			// Convert to JSON to remove functions from DocumentData objects
			assert.deepEqual(JSON.parse(JSON.stringify(processedData)), JSON.parse(JSON.stringify(data)));
		});
	})
});
