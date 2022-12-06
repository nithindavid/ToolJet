import React from 'react';
import { dataqueryService } from '@/_services';
import { toast } from 'react-hot-toast';
import ReactTooltip from 'react-tooltip';
import { allSources, source } from './QueryEditors';
import { Transformation } from './Transformation';
import { previewQuery, getSvgIcon } from '@/_helpers/appUtils';
import { EventManager } from '../Inspector/EventManager';
import { CodeHinter } from '../CodeBuilder/CodeHinter';
import { DataSourceTypes } from '../DataSourceManager/SourceComponents';
import RunjsIcon from '../Icons/runjs.svg';
import Preview from './Preview';
import DataSourceLister from './DataSourceLister';
import _, { isEmpty, isEqual, capitalize } from 'lodash';
import { Button, ButtonGroup, Dropdown } from 'react-bootstrap';
import { allOperations } from '@tooljet/plugins/client';
// eslint-disable-next-line import/no-unresolved
import { withTranslation } from 'react-i18next';
import cx from 'classnames';
// eslint-disable-next-line import/no-unresolved
import { diff } from 'deep-object-diff';

const queryNameRegex = new RegExp('^[A-Za-z0-9_-]*$');

const staticDataSources = [
  { kind: 'restapi', id: 'null', name: 'REST API' },
  { kind: 'runjs', id: 'runjs', name: 'Run JavaScript code' },
];

class QueryManagerComponent extends React.Component {
  constructor(props) {
    super(props);

    this.state = {
      options: {},
      selectedQuery: null,
      selectedDataSource: null,
      dataSourceMeta: {},
      dataQueries: [],
      theme: {},
      isSourceSelected: false,
      isFieldsChanged: false,
      isNameChanged: false,
      paneHeightChanged: false,
      showSaveConfirmation: false,
      restArrayValuesChanged: false,
      nextProps: null,
      buttonText: '',
    };

    this.defaultOptions = React.createRef({});
    this.previewPanelRef = React.createRef();
    this.queryManagerPreferences = JSON.parse(localStorage.getItem('queryManagerPreferences'));
    if (localStorage.getItem('queryManagerButtonConfig') === null) {
      this.buttonConfig = this.queryManagerPreferences?.buttonConfig ?? {};
    } else {
      this.buttonConfig = JSON.parse(localStorage.getItem('queryManagerButtonConfig'));
      localStorage.setItem(
        'queryManagerPreferences',
        JSON.stringify({ ...this.queryManagerPreferences, buttonConfig: this.buttonConfig })
      );
      localStorage.removeItem('queryManagerButtonConfig');
    }
  }

  setStateFromProps = (props) => {
    const selectedQuery = props.selectedQuery;
    const dataSourceId = selectedQuery?.data_source_id;
    const source = props.dataSources.find((datasource) => datasource.id === dataSourceId);
    let dataSourceMeta;
    if (selectedQuery?.pluginId) {
      dataSourceMeta = selectedQuery.manifestFile.data.source;
    } else {
      dataSourceMeta = DataSourceTypes.find((source) => source.kind === selectedQuery?.kind);
    }

    const paneHeightChanged = this.state.queryPaneHeight !== props.queryPaneHeight;
    const dataQueries = props.dataQueries?.length ? props.dataQueries : this.state.dataQueries;
    const queryPaneDragged = this.state.isQueryPaneDragging !== props.isQueryPaneDragging;
    this.setState(
      {
        appId: props.appId,
        dataSources: props.dataSources,
        dataQueries: dataQueries,
        appDefinition: props.appDefinition,
        mode: props.mode,
        currentTab: 1,
        addingQuery: props.addingQuery,
        editingQuery: props.editingQuery,
        queryPanelHeight: props.queryPanelHeight,
        isQueryPaneDragging: props.isQueryPaneDragging,
        currentState: props.currentState,
        selectedSource: source,
        options: this.state.isFieldsChanged ? this.state.options : selectedQuery?.options ?? {},
        dataSourceMeta,
        paneHeightChanged,
        isSourceSelected: paneHeightChanged || queryPaneDragged ? this.state.isSourceSelected : props.isSourceSelected,
        selectedDataSource:
          paneHeightChanged || queryPaneDragged ? this.state.selectedDataSource : props.selectedDataSource,
        queryPreviewData: this.state.selectedQuery?.id !== props.selectedQuery?.id ? undefined : props.queryPreviewData,
        selectedQuery: props.mode === 'create' ? selectedQuery : this.state.selectedQuery,
        isFieldsChanged: props.isUnsavedQueriesAvailable,
        isNameChanged: props.isUnsavedQueriesAvailable,
        theme: {
          scheme: 'bright',
          author: 'chris kempson (http://chriskempson.com)',
          base00: props.darkMode ? '#272822' : '#000000',
          base01: '#303030',
          base02: '#505050',
          base03: '#b0b0b0',
          base04: '#d0d0d0',
          base05: '#e0e0e0',
          base06: '#f5f5f5',
          base07: '#ffffff',
          base08: '#fb0120',
          base09: '#fc6d24',
          base0A: '#fda331',
          base0B: '#a1c659',
          base0C: '#76c7b7',
          base0D: '#6fb3d2',
          base0E: '#d381c3',
          base0F: '#be643c',
        },
        buttonText:
          props.mode === 'edit'
            ? this.buttonConfig?.editMode?.text ?? 'Save & Run'
            : this.buttonConfig?.createMode?.text ?? 'Create & Run',
        shouldRunQuery:
          props.mode === 'edit'
            ? this.buttonConfig?.editMode?.shouldRunQuery ?? true
            : this.buttonConfig?.createMode?.shouldRunQuery ?? true,
      },
      () => {
        let source = props.dataSources.find((datasource) => datasource.id === selectedQuery?.data_source_id);
        if (selectedQuery?.kind === 'restapi') {
          if (!selectedQuery.data_source_id) {
            source = { kind: 'restapi', id: 'null', name: 'REST API' };
          }
        }
        if (selectedQuery?.kind === 'runjs') {
          if (!selectedQuery.data_source_id) {
            source = { kind: 'runjs', id: 'runjs', name: 'Run JavaScript code' };
          }
        }
        if (this.props.mode === 'edit') {
          this.defaultOptions.current =
            this.state.selectedQuery?.id === selectedQuery?.id ? this.state.options : selectedQuery.options;
          this.setState({
            options: paneHeightChanged || props.isUnsavedQueriesAvailable ? this.state.options : selectedQuery.options,
            selectedQuery,
            queryName: this.state.isNameChanged ? this.state.queryName : selectedQuery.name,
          });
        }
        // Hack to provide state updated to codehinter suggestion
        this.setState({ selectedDataSource: null }, () => this.setState({ selectedDataSource: source }));
      }
    );
  };

  componentWillReceiveProps(nextProps) {
    if (nextProps.loadingDataSources) return;
    if (this.props.showQueryConfirmation && !nextProps.showQueryConfirmation) {
      if (this.state.isUpdating) {
        this.setState({
          isUpdating: false,
        });
      }
      if (this.state.isCreating) {
        this.setState({
          isCreating: false,
        });
      }
    }
    if (!isEmpty(this.state.updatedQuery)) {
      const query = nextProps.dataQueries.find((q) => q.id === this.state.updatedQuery.id);
      if (query) {
        const isLoading = nextProps.currentState?.queries[query.name]
          ? nextProps.currentState?.queries[query.name]?.isLoading
          : false;
        const prevLoading = this.state.currentState?.queries[query.name]
          ? this.state.currentState?.queries[query.name]?.isLoading
          : false;
        if (!isEmpty(nextProps.selectedQuery) && !isEqual(this.state.selectedQuery, nextProps.selectedQuery)) {
          if (query && !isLoading && !prevLoading) {
            this.props.runQuery(query.id, query.name);
          }
        } else if (!isLoading && prevLoading) {
          this.state.updatedQuery.updateQuery
            ? this.setState({ updatedQuery: {}, isUpdating: false })
            : this.setState({ updatedQuery: {}, isCreating: false });
        }
      }
    }

    const diffProps = diff(this.props, nextProps);

    if (
      Object.keys(diffProps).length === 0 ||
      diffProps.hasOwnProperty('toggleQueryEditor') ||
      (diffProps.hasOwnProperty('selectedQuery') && nextProps.selectedQuery?.id === 'draftQuery') ||
      (!this.props.isUnsavedQueriesAvailable && nextProps.isUnsavedQueriesAvailable)
    ) {
      return;
    }

    this.setStateFromProps(nextProps);
  }

  removeRestKey = (options) => {
    delete options.arrayValuesChanged;
    return options;
  };

  handleBackButton = () => {
    this.setState({
      isSourceSelected: true,
      queryPreviewData: undefined,
    });
  };

  handleBackButtonClick = () => {
    if (this.state.isFieldsChanged) {
      this.props.setSaveConfirmation(true);
      this.props.setCancelData({
        isSourceSelected: false,
        selectedDataSource: null,
        selectedQuery: {},
        draftQuery: null,
      });
    } else {
      this.setState({
        isSourceSelected: false,
        selectedDataSource: null,
        options: {},
      });
      this.props.clearDraftQuery();
    }
  };

  changeDataSource = (sourceId) => {
    const source = [...this.state.dataSources, ...staticDataSources].find((datasource) => datasource.id === sourceId);

    const isSchemaUnavailable = ['restapi', 'stripe', 'runjs'].includes(source.kind);
    const schemaUnavailableOptions = {
      restapi: {
        method: 'get',
        url: null,
        url_params: [['', '']],
        headers: [['', '']],
        body: [['', '']],
        json_body: null,
        body_toggle: false,
      },
      stripe: {},
      runjs: {
        code: '',
      },
    };

    let newOptions = {};

    if (isSchemaUnavailable) {
      newOptions = {
        ...{ ...schemaUnavailableOptions[source.kind] },
        ...(source?.kind != 'runjs' && { transformationLanguage: 'javascript', enableTransformation: false }),
      };
    } else {
      const selectedSourceDefault =
        source?.plugin?.operations_file?.data?.defaults ?? allOperations[capitalize(source.kind)]?.defaults;
      if (selectedSourceDefault) {
        newOptions = {
          ...{ ...selectedSourceDefault },
          ...(source?.kind != 'runjs' && { transformationLanguage: 'javascript', enableTransformation: false }),
        };
      } else {
        newOptions = {
          ...(source?.kind != 'runjs' && { transformationLanguage: 'javascript', enableTransformation: false }),
        };
      }
    }
    const newQueryName = this.computeQueryName(source.kind);
    this.defaultOptions.current = { ...newOptions };

    this.setState({
      selectedDataSource: source,
      selectedSource: source,
      queryName: newQueryName,
      options: { ...newOptions },
    });

    this.props.createDraftQuery(
      { ...source, name: newQueryName, id: 'draftQuery', options: { ...newOptions } },
      source
    );
  };

  switchCurrentTab = (tab) => {
    this.setState({
      currentTab: tab,
    });
  };

  validateQueryName = () => {
    const { queryName, mode, selectedQuery } = this.state;
    const { dataQueries } = this.props;
    if (mode === 'create') {
      return dataQueries.find((query) => query.name === queryName) === undefined && queryNameRegex.test(queryName);
    }
    const existingQuery = dataQueries.find((query) => query.name === queryName);
    if (existingQuery) {
      return existingQuery.id === selectedQuery.id && queryNameRegex.test(queryName);
    }
    return queryNameRegex.test(queryName);
  };

  computeQueryName = (kind) => {
    const { dataQueries } = this.props;
    const currentQueriesForKind = dataQueries.filter((query) => query.kind === kind);
    let found = false;
    let newName = '';
    let currentNumber = currentQueriesForKind.length + 1;

    while (!found) {
      newName = `${kind}${currentNumber}`;
      if (dataQueries.find((query) => query.name === newName) === undefined) {
        found = true;
      }
      currentNumber += 1;
    }

    return newName;
  };

  createOrUpdateDataQuery = () => {
    const { appId, options, selectedDataSource, mode, queryName, shouldRunQuery } = this.state;
    const appVersionId = this.props.editingVersionId;
    const kind = selectedDataSource.kind;
    const dataSourceId = selectedDataSource.id === 'null' ? null : selectedDataSource.id;
    const pluginId = selectedDataSource.plugin_id;

    const isQueryNameValid = this.validateQueryName();
    if (!isQueryNameValid) {
      toast.error('Invalid query name. Should be unique and only include letters, numbers and underscore.');
      return;
    }

    if (mode === 'edit') {
      this.setState({ isUpdating: true });
      dataqueryService
        .update(this.state.selectedQuery.id, queryName, options)
        .then((data) => {
          this.setState({
            isUpdating: shouldRunQuery ? true : false,
            isFieldsChanged: false,
            isNameChanged: false,
            restArrayValuesChanged: false,
            updatedQuery: shouldRunQuery ? { ...data, updateQuery: true } : {},
          });
          this.props.dataQueriesChanged();
          this.props.setStateOfUnsavedQueries(false);
          localStorage.removeItem('transformation');
        })
        .catch(({ error }) => {
          this.setState({
            isUpdating: false,
            isFieldsChanged: false,
            isNameChanged: false,
            restArrayValuesChanged: false,
          });
          this.props.setStateOfUnsavedQueries(false);
          toast.error(error);
        });
    } else {
      this.setState({ isCreating: true });
      dataqueryService
        .create(appId, appVersionId, queryName, kind, options, dataSourceId, pluginId)
        .then((data) => {
          toast.success('Query Added');
          this.setState({
            isCreating: shouldRunQuery ? true : false,
            isFieldsChanged: false,
            isNameChanged: false,
            restArrayValuesChanged: false,
            updatedQuery: shouldRunQuery ? { ...data, updateQuery: false } : {},
          });
          this.props.clearDraftQuery();
          this.props.dataQueriesChanged();
          this.props.setStateOfUnsavedQueries(false);
        })
        .catch(({ error }) => {
          this.setState({
            isCreating: false,
            isFieldsChanged: false,
            isNameChanged: false,
            restArrayValuesChanged: false,
          });
          this.props.setStateOfUnsavedQueries(false);
          toast.error(error);
        });
    }
  };

  validateNewOptions = (newOptions) => {
    const headersChanged = newOptions.arrayValuesChanged ?? false;
    let isFieldsChanged = false;
    if (this.state.selectedQuery) {
      const isQueryChanged = !_.isEqual(
        this.removeRestKey(newOptions),
        this.removeRestKey(this.defaultOptions.current)
      );
      if (isQueryChanged) {
        isFieldsChanged = true;
      } else if (this.state.selectedQuery.kind === 'restapi' && headersChanged) {
        isFieldsChanged = true;
      }
    } else if (this.props.mode === 'create') {
      isFieldsChanged = true;
    }
    this.setState(
      {
        options: { ...this.state.options, ...newOptions },
        isFieldsChanged,
        restArrayValuesChanged: headersChanged,
      },
      () => {
        if (isFieldsChanged !== this.props.isUnsavedQueriesAvailable)
          this.props.setStateOfUnsavedQueries(isFieldsChanged);
      }
    );
  };

  optionchanged = (option, value) => {
    const newOptions = { ...this.state.options, [option]: value };
    this.validateNewOptions(newOptions);
  };

  optionsChanged = (newOptions) => {
    this.validateNewOptions(newOptions);
  };

  toggleOption = (option) => {
    const currentValue = this.state.options[option] ? this.state.options[option] : false;
    this.optionchanged(option, !currentValue);
  };

  // Here we have mocked data query in format of a component to be usable by event manager
  // TODO: Refactor EventManager to be generic
  mockDataQueryAsComponent = () => {
    const dataQueryEvents = this.state.options?.events || [];

    return {
      component: { component: { definition: { events: dataQueryEvents } } },
      componentMeta: {
        events: {
          onDataQuerySuccess: { displayName: 'Query Success' },
          onDataQueryFailure: { displayName: 'Query Failure' },
        },
      },
    };
  };

  eventsChanged = (events) => {
    this.optionchanged('events', events);
  };

  updateButtonText = (text, shouldRunQuery) => {
    if (this.state.mode === 'edit') {
      this.buttonConfig = { ...this.buttonConfig, editMode: { text: text, shouldRunQuery: shouldRunQuery } };
      localStorage.setItem(
        'queryManagerPreferences',
        JSON.stringify({ ...this.queryManagerPreferences, buttonConfig: this.buttonConfig })
      );
    } else {
      this.buttonConfig = { ...this.buttonConfig, createMode: { text: text, shouldRunQuery: shouldRunQuery } };
      localStorage.setItem(
        'queryManagerPreferences',
        JSON.stringify({ ...this.queryManagerPreferences, buttonConfig: this.buttonConfig })
      );
    }
    this.setState({ buttonText: text, shouldRunQuery: shouldRunQuery });
  };

  updateQueryName = (e) => {
    const { value } = e.target;
    if (value !== this.state.selectedQuery?.name && (!this.state.isNameChanged || !this.state.isNameChanged)) {
      this.setState({ queryName: value, isFieldsChanged: true, isNameChanged: true });
      this.props.setStateOfUnsavedQueries(true);
    } else {
      this.setState({ queryName: value });
    }
  };

  render() {
    const {
      dataSources,
      selectedDataSource,
      mode,
      options,
      currentTab,
      isUpdating,
      isCreating,
      addingQuery,
      editingQuery,
      selectedQuery,
      queryName,
      previewLoading,
      queryPreviewData,
      dataSourceMeta,
    } = this.state;
    let ElementToRender = '';

    if (selectedDataSource) {
      const sourcecomponentName = selectedDataSource.kind.charAt(0).toUpperCase() + selectedDataSource.kind.slice(1);
      ElementToRender = allSources[sourcecomponentName] || source;
    }

    let dropDownButtonText = mode === 'edit' ? 'Save' : 'Create';
    const buttonDisabled = isUpdating || isCreating;
    const mockDataQueryComponent = this.mockDataQueryAsComponent();
    const iconFile = this?.state?.selectedDataSource?.plugin?.icon_file?.data ?? undefined;
    const Icon = () => getSvgIcon(this?.state?.selectedDataSource?.kind, 18, 18, iconFile, { marginLeft: 7 });

    return (
      <div
        className={cx('query-manager', { 'd-none': this.props.loadingDataSources })}
        key={selectedQuery ? selectedQuery.id : ''}
      >
        <ReactTooltip type="dark" effect="solid" delayShow={250} />
        <div className="row header">
          <div className="col">
            {(addingQuery || editingQuery) && selectedDataSource && (
              <div className="nav-header">
                <ul className="nav nav-tabs query-manager-header" data-bs-toggle="tabs">
                  <li className="nav-item">
                    <a
                      onClick={() => this.switchCurrentTab(1)}
                      className={currentTab === 1 ? 'nav-link active' : 'nav-link'}
                      data-cy={'query-tab-general'}
                    >
                      &nbsp; {this.props.t('editor.queryManager.general', 'General')}
                    </a>
                  </li>
                  <li className="nav-item">
                    <a
                      onClick={() => this.switchCurrentTab(2)}
                      className={currentTab === 2 ? 'nav-link active' : 'nav-link'}
                      data-cy={'query-tab-advanced'}
                    >
                      &nbsp; {this.props.t('editor.queryManager.advanced', 'Advanced')}
                    </a>
                  </li>
                </ul>
              </div>
            )}
          </div>
          {(addingQuery || editingQuery) && selectedDataSource && (
            <div className="col-2 query-name-field">
              <input
                type="text"
                onChange={this.updateQueryName}
                className="form-control-plaintext form-control-plaintext-sm mt-1"
                value={queryName}
                autoFocus={false}
                data-cy={'query-label-input-field'}
              />
            </div>
          )}
          <div className="col-auto px-1 m-auto">
            {selectedDataSource && (addingQuery || editingQuery) && (
              <button
                onClick={() => {
                  const _options = { ...options };

                  const query = {
                    data_source_id: selectedDataSource.id === 'null' ? null : selectedDataSource.id,
                    pluginId: selectedDataSource.plugin_id,
                    options: _options,
                    kind: selectedDataSource.kind,
                  };
                  previewQuery(this, query, this.props.editorState)
                    .then(() => {
                      this.previewPanelRef.current.scrollIntoView();
                    })
                    .catch(({ error, data }) => {
                      console.log(error, data);
                    });
                }}
                className={`btn button-family-secondary m-1 float-right1 ${previewLoading ? 'button-loading' : ''} ${
                  this.props.darkMode ? 'dark' : ''
                } ${this.state.selectedDataSource ? '' : 'disabled'}`}
                style={{ width: '72px', height: '28px' }}
                data-cy={'query-preview-button'}
              >
                {this.props.t('editor.queryManager.preview', 'Preview')}
              </button>
            )}
            {selectedDataSource && (addingQuery || editingQuery) && (
              <Dropdown as={ButtonGroup} className={'m-1 float-right'} style={{ display: 'initial', height: '28px' }}>
                <Button
                  className={`btn btn-primary ${isUpdating || isCreating ? 'btn-loading' : ''} ${
                    this.state.selectedDataSource ? '' : 'disabled'
                  }`}
                  style={{ height: '28px', zIndex: 10 }}
                  onClick={this.createOrUpdateDataQuery}
                  disabled={buttonDisabled}
                  data-cy={'query-create-and-run-button'}
                >
                  {this.state.buttonText}
                </Button>
                <Dropdown.Toggle
                  split
                  className="btn btn-primary d-none d-lg-inline create-save-button-dropdown-toggle"
                  style={{ height: '28px', paddingTop: '5px' }}
                  data-cy={'query-create-dropdown'}
                />
                <Dropdown.Menu className="import-lg-position">
                  <Dropdown.Item
                    onClick={() => {
                      this.updateButtonText(dropDownButtonText, false);
                    }}
                    data-cy={`query-${String(dropDownButtonText).toLocaleLowerCase()}-option`}
                  >
                    {this.props.t(`editor.queryManager.${dropDownButtonText}`, dropDownButtonText)}
                  </Dropdown.Item>
                  <Dropdown.Item
                    onClick={() => {
                      this.updateButtonText(`${dropDownButtonText} & Run`, true);
                    }}
                    data-cy={`query-${String(dropDownButtonText).toLocaleLowerCase()}-and-run-option`}
                  >
                    {this.props.t(`editor.queryManager.${dropDownButtonText} & Run`, `${dropDownButtonText} & Run`)}
                  </Dropdown.Item>
                </Dropdown.Menu>
              </Dropdown>
            )}
            <span onClick={this.props.toggleQueryEditor} className="cursor-pointer m-3" data-tip="Hide query editor">
              <svg width="18" height="10" viewBox="0 0 18 10" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M1 1L9 9L17 1" stroke="#61656F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          </div>
        </div>

        {(addingQuery || editingQuery) && (
          <div className="py-2">
            {currentTab === 1 && (
              <div className="row row-deck px-2 mt-0 query-details">
                {dataSources && mode === 'create' && (
                  <div className="datasource-picker mt-1 mb-2">
                    <div className="datasource-heading ">
                      {this.state.selectedDataSource !== null && (
                        <p onClick={this.handleBackButtonClick} style={{ marginTop: '-7px' }}>
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            className="icon icon-tabler icon-tabler-arrow-left"
                            width="44"
                            height="44"
                            viewBox="0 0 24 24"
                            strokeWidth="1.5"
                            stroke="#9e9e9e"
                            fill="none"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path stroke="none" d="M0 0h24v24H0z" fill="none" />
                            <line x1="5" y1="12" x2="19" y2="12" />
                            <line x1="5" y1="12" x2="11" y2="18" />
                            <line x1="5" y1="12" x2="11" y2="6" />
                          </svg>
                        </p>
                      )}
                      {!this.state.isSourceSelected && (
                        <label className="form-label col-md-3" data-cy={'label-select-datasource'}>
                          {this.props.t('editor.queryManager.selectDatasource', 'Select Datasource')}
                        </label>
                      )}{' '}
                      {this?.state?.selectedDataSource?.kind && (
                        <div className="header-query-datasource-card-container">
                          <div
                            className="header-query-datasource-card badge "
                            style={{
                              background: this.props.darkMode ? '#2f3c4c' : 'white',
                              color: this.props.darkMode ? 'white' : '#3e525b',
                            }}
                          >
                            {this.state?.selectedDataSource?.kind === 'runjs' ? (
                              <RunjsIcon style={{ height: 18, width: 18, marginTop: '-3px' }} />
                            ) : (
                              <Icon />
                            )}
                            <p
                              className="header-query-datasource-name"
                              data-cy={`${this.state.selectedDataSource.kind}`}
                            >
                              {' '}
                              {this.state?.selectedDataSource?.kind && this.state.selectedDataSource.kind}
                            </p>
                          </div>{' '}
                        </div>
                      )}
                    </div>
                    {!this.state.isSourceSelected && (
                      <DataSourceLister
                        dataSources={dataSources}
                        staticDataSources={staticDataSources}
                        changeDataSource={this.changeDataSource}
                        handleBackButton={this.handleBackButton}
                        darkMode={this.props.darkMode}
                        dataSourceModalHandler={this.props.dataSourceModalHandler}
                      />
                    )}
                  </div>
                )}

                {selectedDataSource && (
                  <div>
                    <ElementToRender
                      pluginSchema={this.state.selectedDataSource?.plugin?.operations_file?.data}
                      selectedDataSource={selectedDataSource}
                      options={this.state.options}
                      optionsChanged={this.optionsChanged}
                      optionchanged={this.optionchanged}
                      currentState={this.props.currentState}
                      darkMode={this.props.darkMode}
                      isEditMode={true} // Made TRUE always to avoid setting default options again
                      queryName={this.state.queryName}
                    />

                    {!dataSourceMeta?.disableTransformations && selectedDataSource?.kind != 'runjs' && (
                      <div>
                        <div className="mb-3 mt-4">
                          <Transformation
                            changeOption={this.optionchanged}
                            options={options ?? {}}
                            currentState={this.props.currentState}
                            darkMode={this.props.darkMode}
                            queryId={selectedQuery?.id}
                          />
                        </div>
                      </div>
                    )}
                    <Preview
                      previewPanelRef={this.previewPanelRef}
                      previewLoading={previewLoading}
                      queryPreviewData={queryPreviewData}
                      theme={this.state.theme}
                      darkMode={this.props.darkMode}
                    />
                  </div>
                )}
              </div>
            )}

            {currentTab === 2 && (
              <div className="advanced-options-container m-2">
                <div className="form-check form-switch">
                  <input
                    className="form-check-input"
                    type="checkbox"
                    onClick={() => this.toggleOption('runOnPageLoad')}
                    checked={this.state.options.runOnPageLoad}
                    data-cy={'toggle-run-query-on-page-load'}
                  />
                  <span className="form-check-label" data-cy={'label-run-query-on-page-load'}>
                    {this.props.t('editor.queryManager.runQueryOnPageLoad', 'Run this query on page load?')}
                  </span>
                </div>
                <div className="form-check form-switch">
                  <input
                    className="form-check-input"
                    type="checkbox"
                    onClick={() => this.toggleOption('requestConfirmation')}
                    checked={this.state.options.requestConfirmation}
                    data-cy={'toggle-request-confirmation-on-run'}
                  />
                  <span className="form-check-label" data-cy={'label-request-confirmation-on-run'}>
                    {this.props.t(
                      'editor.queryManager.confirmBeforeQueryRun',
                      'Request confirmation before running query?'
                    )}
                  </span>
                </div>

                <div className="form-check form-switch">
                  <input
                    className="form-check-input"
                    type="checkbox"
                    onClick={() => this.toggleOption('showSuccessNotification')}
                    checked={this.state.options.showSuccessNotification}
                    data-cy={'toggle-show-notification'}
                  />
                  <span className="form-check-label" data-cy={'label-show-notification'}>
                    {this.props.t('editor.queryManager.notificationOnSuccess', 'Show notification on success?')}
                  </span>
                </div>
                {this.state.options.showSuccessNotification && (
                  <div>
                    <div className="row mt-3">
                      <div className="col-auto">
                        <label className="form-label p-2" data-cy={'label-success-message-input'}>
                          {this.props.t('editor.queryManager.successMessage', 'Success Message')}
                        </label>
                      </div>
                      <div className="col">
                        <CodeHinter
                          currentState={this.props.currentState}
                          initialValue={this.state.options.successMessage}
                          height="36px"
                          theme={this.props.darkMode ? 'monokai' : 'default'}
                          onChange={(value) => this.optionchanged('successMessage', value)}
                          placeholder={this.props.t(
                            'editor.queryManager.queryRanSuccessfully',
                            'Query ran successfully'
                          )}
                          cyLabel={'success-message'}
                        />
                      </div>
                    </div>

                    <div className="row mt-3">
                      <div className="col-auto">
                        <label className="form-label p-2" data-cy={'label-notification-duration-input'}>
                          {this.props.t('editor.queryManager.notificationDuration', 'Notification duration (s)')}
                        </label>
                      </div>
                      <div className="col">
                        <input
                          type="number"
                          disabled={!this.state.options.showSuccessNotification}
                          onChange={(e) => this.optionchanged('notificationDuration', e.target.value)}
                          placeholder={5}
                          className="form-control"
                          value={this.state.options.notificationDuration}
                          data-cy={'notification-duration-input-field'}
                        />
                      </div>
                    </div>
                  </div>
                )}

                <div className="hr-text hr-text-left">{this.props.t('editor.queryManager.events', 'Events')}</div>

                <div className="query-manager-events">
                  <EventManager
                    eventsChanged={this.eventsChanged}
                    component={mockDataQueryComponent.component}
                    componentMeta={mockDataQueryComponent.componentMeta}
                    currentState={this.props.currentState}
                    dataQueries={this.props.dataQueries}
                    components={this.props.allComponents}
                    apps={this.props.apps}
                    popoverPlacement="top"
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }
}

export const QueryManager = withTranslation()(React.memo(QueryManagerComponent));
