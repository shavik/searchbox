// @flow
import type {
  DataField,
  ComponentConfig,
  Options,
  Option,
  RequestStatus,
  AppbaseSettings,
  GenerateQueryResponse,
  MicStatusField
} from './types';
import Observable from './Observable';
import Base from './Base';
import SearchBase from './SearchBase';
import Results from './Results';
import Aggregations from './Aggregations';

import {
  queryTypes,
  queryFormats,
  sortOptions,
  errorMessages,
  getNormalizedField,
  getNormalizedWeights,
  flatReactProp,
  getSuggestions,
  querySuggestionFields,
  isEqual,
  searchBaseMappings
} from './utils';

type QueryType =
  | queryTypes.Search
  | queryTypes.Term
  | queryTypes.Geo
  | queryTypes.Range;

type QueryFormat = queryFormats.Or | queryFormats.And;

type SortType = sortOptions.Asc | sortOptions.Desc | sortOptions.Count;

const defaultOptions: Options = {
  triggerDefaultQuery: true,
  triggerCustomQuery: false,
  stateChanges: true
};

const defaultOption: Option = {
  stateChanges: true
};

const MIC_STATUS = {
  inactive: 'INACTIVE',
  active: 'ACTIVE',
  denied: 'DENIED'
};

const REQUEST_STATUS = {
  inactive: 'INACTIVE',
  pending: 'PENDING',
  error: 'ERROR'
};

const suggestionQueryID = 'DataSearch__suggestions';

/**
 * SearchComponent class is responsible for the following things:
 * - It provides the methods to trigger the query
 * - It maintains the request state for e.g loading, error etc.
 * - It handles the `custom` and `default` queries
 * - Basically the SearchComponent class provides all the utilities to build any ReactiveSearch component
 */
class SearchComponent extends Base {
  // RS API properties
  id: string;

  type: QueryType;

  react: Object;

  queryFormat: QueryFormat;

  dataField: string | Array<string | DataField>;

  categoryField: string;

  categoryValue: string;

  nestedField: string;

  from: number;

  size: number;

  sortBy: SortType;

  value: any;

  aggregationField: string;

  after: Object;

  includeNullValues: boolean;

  includeFields: Array<string>;

  excludeFields: Array<string>;

  fuzziness: string | number;

  searchOperators: boolean;

  highlight: boolean;

  highlightField: string | Array<string>;

  customHighlight: Object;

  interval: number;

  aggregations: Array<string>;

  missingLabel: string;

  showMissing: boolean;

  defaultQuery: (component: SearchComponent) => void;

  customQuery: (component: SearchComponent) => void;

  execute: boolean;

  enableSynonyms: boolean;

  selectAllLabel: string;

  pagination: boolean;

  queryString: boolean;

  // other properties

  // To enable the query suggestions
  enableQuerySuggestions: boolean;

  // To show the distinct suggestions
  showDistinctSuggestions: boolean;

  // query error
  error: any;

  // state changes subject
  stateChanges: Observable;

  // request status
  requestStatus: RequestStatus;

  // results
  results: Results;

  // aggregations
  aggregationData: Aggregations;

  /* ------ Private properties only for the internal use ----------- */
  _parent: SearchBase;

  // Counterpart of the query
  _query: Object;

  // TODO: Check on the below properties
  // mic status
  _micStatus: MicStatusField;

  // mic instance
  _micInstance: any;

  // query search ID
  _queryId: string;

  /* ---- callbacks to create the side effects while querying ----- */

  beforeValueChange: (value: string) => Promise<any>;

  /* ------------- change events -------------------------------- */

  // called when value changes
  onValueChange: (next: string, prev: string) => void;

  // called when results change
  onResults: (next: string, prev: string) => void;

  // called when composite aggregationData change
  onAggregationData: (next: Array<Object>, prev: Array<Object>) => void;

  // called when there is an error while fetching results
  onError: (error: any) => void;

  // called when request status changes
  onRequestStatusChange: (next: string, prev: string) => void;

  // called when query changes
  onQueryChange: (next: string, prev: string) => void;

  // called when mic status changes
  onMicStatusChange: (next: string, prev: string) => void;

  constructor({
    index,
    url,
    credentials,
    appbaseConfig,
    headers,
    transformRequest,
    transformResponse,
    beforeValueChange,
    onValueChange,
    onResults,
    onAggregationData,
    onError,
    onRequestStatusChange,
    onQueryChange,
    onMicStatusChange,
    enableQuerySuggestions,
    results,
    showDistinctSuggestions,
    ...rsAPIConfig
  }: ComponentConfig) {
    super({
      index,
      url,
      credentials,
      headers,
      appbaseConfig,
      transformRequest,
      transformResponse
    });
    const {
      id,
      type,
      react,
      queryFormat,
      dataField,
      categoryField,
      categoryValue,
      nestedField,
      from,
      size,
      sortBy,
      value,
      aggregationField,
      after,
      includeNullValues,
      includeFields,
      excludeFields,
      fuzziness,
      searchOperators,
      highlight,
      highlightField,
      customHighlight,
      interval,
      aggregations,
      missingLabel,
      showMissing,
      defaultQuery,
      customQuery,
      execute,
      enableSynonyms,
      selectAllLabel,
      pagination,
      queryString
    } = rsAPIConfig;

    if (!id) {
      throw new Error(errorMessages.invalidComponentId);
    }
    // dataField is required for components other then search
    if (type && type !== queryTypes.Search) {
      if (!dataField) {
        throw new Error(errorMessages.invalidDataField);
      } else if (Array.isArray(dataField)) {
        throw new Error(errorMessages.dataFieldAsArray);
      }
    }

    this.id = id;
    this.type = type;
    this.react = react;
    this.queryFormat = queryFormat;
    this.dataField = dataField;
    this.categoryField = categoryField;
    this.categoryValue = categoryValue;
    this.nestedField = nestedField;
    this.from = from;
    this.size = size;
    this.sortBy = sortBy;
    this.aggregationField = aggregationField;
    this.after = after;
    this.includeNullValues = includeNullValues;
    this.includeFields = includeFields;
    this.excludeFields = excludeFields;
    this.fuzziness = fuzziness;
    this.searchOperators = searchOperators;
    this.highlight = highlight;
    this.highlightField = highlightField;
    this.customHighlight = customHighlight;
    this.interval = interval;
    this.aggregations = aggregations;
    this.missingLabel = missingLabel;
    this.showMissing = showMissing;
    this.execute = execute;
    this.enableSynonyms = enableSynonyms;
    this.selectAllLabel = selectAllLabel;
    this.pagination = pagination;
    this.queryString = queryString;
    this.defaultQuery = defaultQuery;
    this.customQuery = customQuery;
    this.beforeValueChange = beforeValueChange;
    this.onValueChange = onValueChange;
    this.onResults = onResults;
    this.onAggregationData = onAggregationData;
    this.onError = onError;
    this.onRequestStatusChange = onRequestStatusChange;
    this.onQueryChange = onQueryChange;
    this.onMicStatusChange = onMicStatusChange;

    // other properties
    this.enableQuerySuggestions = enableQuerySuggestions;

    this.showDistinctSuggestions = showDistinctSuggestions;

    // Initialize the state changes observable
    this.stateChanges = new Observable();

    this.results = new Results(results);

    this.aggregationData = new Aggregations();

    if (value) {
      this.setValue(value, {
        stateChanges: true
      });
    } else {
      this.value = value;
    }
  }

  // getters
  get micStatus() {
    return this._micStatus;
  }

  get micInstance() {
    return this._micInstance;
  }

  get micActive() {
    return this._micStatus === MIC_STATUS.active;
  }

  get micInactive() {
    return this._micStatus === MIC_STATUS.inactive;
  }

  get micDenied() {
    return this._micStatus === MIC_STATUS.denied;
  }

  get query() {
    return this._query;
  }

  get requestPending() {
    return this.requestStatus === REQUEST_STATUS.pending;
  }

  get appbaseSettings(): AppbaseSettings {
    const { recordAnalytics, customEvents, enableQueryRules, userId } =
      this.appbaseConfig || {};
    return { recordAnalytics, customEvents, enableQueryRules, userId };
  }

  // To get the parsed suggestions from the results
  get suggestions(): Array<Object> {
    if (this.type && this.type !== queryTypes.Search) {
      return [];
    }
    if (this.results) {
      let fields = getNormalizedField(this.dataField) || [];
      if (
        fields.length === 0 &&
        this.results.data &&
        Array.isArray(this.results.data) &&
        this.results.data.length > 0 &&
        this.results.data[0] &&
        this.results.data[0]._source
      ) {
        // Extract fields from _source
        fields = Object.keys(this.results.data[0]._source);
      }
      if (this.enableQuerySuggestions) {
        // extract suggestions from query suggestion fields too
        fields = [...fields, ...querySuggestionFields];
      }
      return getSuggestions(
        fields,
        this.results.data,
        this.value,
        this.showDistinctSuggestions
      ).slice(0, this.size);
    }
    return [];
  }

  // Method to get the raw query based on the current state
  get componentQuery(): Object {
    return {
      id: this.id,
      type: this.type,
      dataField: getNormalizedField(this.dataField),
      react: this.react,
      highlight: this.highlight,
      highlightField: getNormalizedField(this.highlightField),
      fuzziness: this.fuzziness,
      searchOperators: this.searchOperators,
      includeFields: this.includeFields,
      excludeFields: this.excludeFields,
      size: this.size,
      from: this.from,
      queryFormat: this.queryFormat,
      sortBy: this.sortBy,
      fieldWeights: getNormalizedWeights(this.dataField),
      includeNullValues: this.includeNullValues,
      aggregationField: this.aggregationField,
      categoryField: this.categoryField,
      missingLabel: this.missingLabel,
      showMissing: this.showMissing,
      nestedField: this.nestedField,
      interval: this.interval,
      customHighlight: this.customHighlight,
      customQuery: this.customQuery ? this.customQuery(this) : undefined,
      defaultQuery: this.defaultQuery ? this.defaultQuery(this) : undefined,
      value: this.value,
      categoryValue: this.categoryValue,
      after: this.after,
      aggregations: this.aggregations,
      enableSynonyms: this.enableSynonyms,
      selectAllLabel: this.selectAllLabel,
      pagination: this.pagination,
      queryString: this.queryString
    };
  }

  get queryId(): string {
    // Get query ID from parent(searchbase) if exist
    if (this._parent && this._parent._queryId) {
      return this._parent._queryId;
    }
    // For single components just return the queryId from the component
    if (this._queryId) {
      return this._queryId;
    }
    return '';
  }

  get mappedProps(): Object {
    const mappedProps = {};
    Object.keys(searchBaseMappings).forEach(key => {
      // $FlowFixMe
      mappedProps[searchBaseMappings[key]] = this[key];
    });
    return mappedProps;
  }

  /* -------- Public methods -------- */

  // mic click handler
  onMicClick = (
    micOptions: Object = {},
    options: Options = {
      triggerDefaultQuery: false,
      triggerCustomQuery: false,
      stateChanges: true
    }
  ) => {
    const prevStatus = this._micStatus;
    if (typeof window !== 'undefined') {
      window.SpeechRecognition =
        window.webkitSpeechRecognition || window.SpeechRecognition || null;
    }
    if (
      window &&
      window.SpeechRecognition &&
      prevStatus !== MIC_STATUS.denied
    ) {
      if (prevStatus === MIC_STATUS.active) {
        this._setMicStatus(MIC_STATUS.inactive, options);
      }
      const { SpeechRecognition } = window;
      if (this._micInstance) {
        this._stopMic();
        return;
      }
      this._micInstance = new SpeechRecognition();
      this._micInstance.continuous = true;
      this._micInstance.interimResults = true;
      Object.assign(this._micInstance, micOptions);
      this._micInstance.start();
      this._micInstance.onstart = () => {
        this._setMicStatus(MIC_STATUS.active, options);
      };
      this._micInstance.onresult = ({ results }) => {
        if (results && results[0] && results[0].isFinal) {
          this._stopMic();
        }
        this._handleVoiceResults({ results }, options);
      };
      this._micInstance.onerror = e => {
        if (e.error === 'no-speech' || e.error === 'audio-capture') {
          this._setMicStatus(MIC_STATUS.inactive, options);
        } else if (e.error === 'not-allowed') {
          this._setMicStatus(MIC_STATUS.denied, options);
        }
        console.error(e);
      };
    }
  };

  // Method to set the dataField option
  setDataField = (
    dataField: string | Array<string | DataField>,
    options?: Options = defaultOptions
  ): void => {
    const prev = this.dataField;
    this.dataField = dataField;
    this._applyOptions(options, 'dataField', prev, dataField);
  };

  // To set the parent (SearchBase) instance for the component
  setParent = (parent: SearchBase) => {
    this._parent = parent;
  };

  // Method to set the value
  setValue = (value: any, options?: Options = defaultOptions): void => {
    const performUpdate = () => {
      const prev = this.value;
      this.value = value;
      this._applyOptions(options, 'value', prev, this.value);
    };
    if (this.beforeValueChange) {
      this.beforeValueChange(value)
        .then(performUpdate)
        .catch(e => {
          console.warn('beforeValueChange rejected the promise with ', e);
        });
    } else {
      performUpdate();
    }
  };

  // Method to set the size option
  setSize = (size: number, options?: Options = defaultOptions): void => {
    const prev = this.size;
    this.size = size;
    this._applyOptions(options, 'size', prev, this.size);
  };

  // Method to set the from option
  setFrom = (from: number, options?: Options = defaultOptions): void => {
    const prev = this.from;
    this.from = from;
    this._applyOptions(options, 'from', prev, this.from);
  };

  // Method to set the fuzziness option
  setFuzziness = (
    fuzziness: number | string,
    options?: Options = defaultOptions
  ): void => {
    const prev = this.fuzziness;
    this.fuzziness = fuzziness;
    this._applyOptions(options, 'fuzziness', prev, this.fuzziness);
  };

  // Method to set the includeFields option
  setIncludeFields = (
    includeFields: Array<string>,
    options?: Options = defaultOptions
  ): void => {
    const prev = this.includeFields;
    this.includeFields = includeFields;
    this._applyOptions(options, 'includeFields', prev, includeFields);
  };

  // Method to set the excludeFields option
  setExcludeFields = (
    excludeFields: Array<string>,
    options?: Options = defaultOptions
  ): void => {
    const prev = this.excludeFields;
    this.excludeFields = excludeFields;
    this._applyOptions(options, 'excludeFields', prev, excludeFields);
  };

  // Method to set the sortBy option
  setSortBy = (sortBy: string, options?: Options = defaultOptions): void => {
    const prev = this.sortBy;
    this.sortBy = sortBy;
    this._applyOptions(options, 'sortBy', prev, sortBy);
  };

  // Method to set the sortBy option
  setReact = (react: Object, options?: Options = defaultOptions): void => {
    const prev = this.react;
    this.react = react;
    this._applyOptions(options, 'react', prev, react);
  };

  // Method to set the default query
  setDefaultQuery = (
    defaultQuery: (component: SearchComponent) => void,
    options?: Options = defaultOptions
  ): void => {
    const prev = this.defaultQuery;
    this.defaultQuery = defaultQuery;
    this._applyOptions(options, 'defaultQuery', prev, defaultQuery);
  };

  // Method to set the custom query
  setCustomQuery = (
    customQuery: (component: SearchComponent) => void,
    options?: Options = defaultOptions
  ): void => {
    const prev = this.customQuery;
    this.customQuery = customQuery;
    this._applyOptions(options, 'customQuery', prev, customQuery);
  };

  // Method to set the after key for composite aggs pagination
  setAfter = (after: Object, options?: Options = defaultOptions): void => {
    const prev = this.after;
    this.after = after;
    this._applyOptions(options, 'after', prev, after);
  };

  // Method to execute the component's own query i.e default query
  triggerDefaultQuery = (options?: Option = defaultOption): Promise<any> => {
    // To prevent duplicate queries
    if (isEqual(this._query, this.componentQuery)) {
      return Promise.resolve(true);
    }
    const handleError = err => {
      this._setError(err, {
        stateChanges: options.stateChanges
      });
      console.error(err);
      return Promise.reject(err);
    };
    try {
      this._updateQuery();
      this._setRequestStatus(REQUEST_STATUS.pending);
      return this._fetchRequest({
        query: Array.isArray(this.query) ? this.query : [this.query],
        settings: this.appbaseSettings
      })
        .then(results => {
          const prev = this.results;
          const rawResults = results && results[this.id];
          const afterResponse = () => {
            if (rawResults.aggregations) {
              this._handleAggregationResponse(rawResults.aggregations, {
                defaultOptions,
                ...options
              });
            }
            this._setRequestStatus(REQUEST_STATUS.inactive);
            this._applyOptions(
              {
                stateChanges: options.stateChanges
              },
              'results',
              prev,
              this.results
            );
          };
          if (
            (!this.type || this.type === queryTypes.Search) &&
            this.enableQuerySuggestions
          ) {
            this._fetchRequest(this.getSuggestionsQuery(), true)
              .then(rawQuerySuggestions => {
                const querySuggestionsData =
                  rawQuerySuggestions[suggestionQueryID];
                // Merge query suggestions as the top suggestions
                if (
                  querySuggestionsData &&
                  querySuggestionsData.hits &&
                  querySuggestionsData.hits.hits &&
                  rawResults.hits &&
                  rawResults.hits.hits
                ) {
                  rawResults.hits.hits = [
                    ...(querySuggestionsData.hits.hits || []).map(hit => ({
                      ...hit,
                      // Set the query suggestion tag for suggestion hits
                      _query_suggestion: true
                    })),
                    ...rawResults.hits.hits
                  ];
                }

                this.results.setRaw(rawResults);
                afterResponse();
              })
              .catch(handleError);
          } else {
            this.results.setRaw(rawResults);
            afterResponse();
          }
          return Promise.resolve(rawResults);
        })
        .catch(handleError);
    } catch (err) {
      return handleError(err);
    }
  };

  // Method to execute the query for watcher components
  triggerCustomQuery = (options?: Option = defaultOption): Promise<any> => {
    // Generate query again after resetting changes
    const { requestBody, orderOfQueries } = this._generateQuery();
    if (requestBody.length) {
      if (isEqual(this._query, requestBody)) {
        return Promise.resolve(true);
      }
      const handleError = err => {
        this._setError(err, {
          stateChanges: options.stateChanges
        });
        console.error(err);
        return Promise.reject(err);
      };
      try {
        // set the request loading to true for all the requests
        orderOfQueries.forEach(id => {
          const componentInstance = this._parent.getComponent(id);
          if (componentInstance) {
            // Reset `from` and `after` values
            componentInstance.setFrom(0, {
              stateChanges: true,
              triggerDefaultQuery: false,
              triggerCustomQuery: false
            });

            componentInstance.setAfter(undefined, {
              stateChanges: true,
              triggerDefaultQuery: false,
              triggerCustomQuery: false
            });

            componentInstance._setRequestStatus(REQUEST_STATUS.pending);
            // Update the query
            componentInstance._updateQuery();
          }
        });
        // Re-generate query after changes
        const { requestBody: finalRequest } = this._generateQuery();
        return this._fetchRequest({
          query: finalRequest,
          settings: this.appbaseSettings
        })
          .then(results => {
            // Update the state for components
            orderOfQueries.forEach(id => {
              const componentInstance = this._parent.getComponent(id);
              if (componentInstance) {
                componentInstance._setRequestStatus(REQUEST_STATUS.inactive);
                // Reset value for dependent components
                componentInstance.setValue(undefined, {
                  stateChanges: true,
                  triggerDefaultQuery: false,
                  triggerCustomQuery: false
                });
                // Update the results
                const prev = componentInstance.results;
                // Collect results from the response for a particular component
                let rawResults = results && results[id];
                // Set results
                if (rawResults.hits) {
                  componentInstance.results.setRaw(rawResults);
                  componentInstance._applyOptions(
                    {
                      stateChanges: options.stateChanges
                    },
                    'results',
                    prev,
                    componentInstance.results
                  );
                }

                if (rawResults.aggregations) {
                  componentInstance._handleAggregationResponse(
                    rawResults.aggregations,
                    {
                      defaultOptions,
                      ...options
                    }
                  );
                }
              }
            });
            return Promise.resolve(results);
          })
          .catch(handleError);
      } catch (err) {
        return handleError(err);
      }
    } else {
      return Promise.resolve({});
    }
  };

  getSuggestionsQuery(): Object {
    return {
      query: [
        {
          id: suggestionQueryID,
          dataField: querySuggestionFields,
          searchOperators: this.searchOperators,
          size: 5,
          value: this.value,
          defaultQuery: {
            sort: [
              {
                count: {
                  order: 'desc'
                }
              }
            ]
          }
        }
      ]
    };
  }

  // use this methods to record a search click event
  recordClick = (objects: Object, isSuggestionClick: boolean = false): void => {
    if (this._analyticsInstance && this.queryId) {
      this._analyticsInstance.click({
        queryID: this.queryId,
        objects,
        isSuggestionClick
      });
    }
  };

  // use this methods to record a search conversion
  recordConversions = (objects: Array<string>) => {
    if (this._analyticsInstance && this.queryId) {
      this._analyticsInstance.conversion({
        queryID: this.queryId,
        objects
      });
    }
  };

  // Method to subscribe the state changes
  subscribeToStateChanges = (
    fn: Function,
    propertiesToSubscribe?: string | Array<string>
  ) => {
    this.stateChanges.subscribe(fn, propertiesToSubscribe);
  };

  // Method to unsubscribe the state changes
  unsubscribeToStateChanges = (fn?: Function) => {
    this.stateChanges.unsubscribe(fn);
  };

  /* -------- Private methods only for the internal use -------- */
  // Method to apply the changed based on set options
  _applyOptions(
    options: Options,
    key: string,
    prevValue: any,
    nextValue: any
  ): void {
    // // Trigger mic events
    if (key === 'micStatus' && this.onMicStatusChange) {
      this.onMicStatusChange(nextValue, prevValue);
    }
    // Trigger events
    if (key === 'query' && this.onQueryChange) {
      this.onQueryChange(nextValue, prevValue);
    }
    if (key === 'value' && this.onValueChange) {
      this.onValueChange(nextValue, prevValue);
    }
    if (key === 'error' && this.onError) {
      this.onError(nextValue);
    }
    if (key === 'results' && this.onResults) {
      this.onResults(nextValue, prevValue);
    }
    if (key === 'aggregationData' && this.onAggregationData) {
      this.onAggregationData(nextValue, prevValue);
    }
    if (key === 'requestStatus' && this.onRequestStatusChange) {
      this.onRequestStatusChange(nextValue, prevValue);
    }
    if (options.triggerDefaultQuery) {
      this.triggerDefaultQuery();
    }
    if (options.triggerCustomQuery) {
      this.triggerCustomQuery();
    }
    if (options.stateChanges !== false) {
      this.stateChanges.next(
        {
          [key]: {
            prev: prevValue,
            next: nextValue
          }
        },
        key
      );
    }
  }

  _fetchRequest(
    requestBody: Object,
    isQuerySuggestionsAPI: boolean = false
  ): Promise<any> {
    // remove undefined properties from request body
    const requestOptions = {
      method: 'POST',
      body: JSON.stringify(requestBody),
      headers: {
        ...this.headers
      }
    };

    return new Promise((resolve, reject) => {
      this._handleTransformRequest(requestOptions)
        .then(finalRequestOptions => {
          // set timestamp in request
          const timestamp = Date.now();

          let suffix = '_reactivesearch.v3';
          const index = isQuerySuggestionsAPI ? '.suggestions' : this.index;
          return fetch(`${this.url}/${index}/${suffix}`, finalRequestOptions)
            .then(res => {
              const responseHeaders = res.headers;

              // check if search component is present
              if (res.headers) {
                const queryID = res.headers.get('X-Search-Id');
                if (queryID) {
                  // if parent exists then set the queryID to parent
                  if (this._parent) {
                    this._parent.setQueryID(queryID);
                  } else {
                    this.setQueryID(queryID);
                  }
                }
              }

              if (res.status >= 500) {
                return reject(res);
              }
              if (res.status >= 400) {
                return reject(res);
              }
              return res.json().then(data => {
                this._handleTransformResponse(data)
                  .then(transformedData => {
                    if (
                      transformedData &&
                      Object.prototype.hasOwnProperty.call(
                        transformedData,
                        'error'
                      )
                    ) {
                      reject(transformedData);
                    }
                    const response = {
                      ...transformedData,
                      _timestamp: timestamp,
                      _headers: responseHeaders
                    };
                    return resolve(response);
                  })
                  .catch(e => {
                    console.warn(
                      'SearchBase: transformResponse rejected the promise with ',
                      e
                    );
                    return reject(e);
                  });
              });
            })
            .catch(e => reject(e));
        })
        .catch(e => {
          console.warn(
            'SearchBase: transformRequest rejected the promise with ',
            e
          );
          return reject(e);
        });
    });
  }

  // Method to generate the final query based on the component's value changes
  _generateQuery(): GenerateQueryResponse {
    /**
     * This method performs the following tasks to generate the query
     * 1. Get all the watcher components for a particular component ID
     * 2. Make the request payload
     * 3. Execute the final query
     * 4. Update results and trigger events => Call `setResults` or `setAggregations` based on the results
     */
    if (this._parent) {
      const components = this._parent.getComponents();
      const watcherComponents = [];
      // Find all the  watcher components
      Object.keys(components).forEach(id => {
        const componentInstance = components[id];
        if (componentInstance && componentInstance.react) {
          const flattenReact = flatReactProp(componentInstance.react, id);
          if (flattenReact.indexOf(this.id) > -1) {
            watcherComponents.push(id);
          }
        }
      });
      const requestQuery = {};
      // Generate the request body for watchers
      watcherComponents.forEach(watcherId => {
        const component = this._parent.getComponent(watcherId);
        if (component) {
          requestQuery[watcherId] = component.componentQuery;
          // collect queries for all components defined in the `react` property
          // that have some value defined
          const flattenReact = flatReactProp(component.react, component.id);
          flattenReact.forEach(id => {
            // only add if not present
            if (!requestQuery[id]) {
              const dependentComponent = this._parent.getComponent(id);
              if (dependentComponent && dependentComponent.value) {
                // Set the execute to `false` for dependent components
                const query = dependentComponent.componentQuery;
                query.execute = false;
                // Add the query to request payload
                requestQuery[id] = query;
              }
            }
          });
        }
      });
      return {
        requestBody: Object.values(requestQuery),
        orderOfQueries: watcherComponents
      };
    }
    return {
      requestBody: [],
      orderOfQueries: []
    };
  }

  _handleTransformResponse(res: any): Promise<any> {
    if (
      this.transformResponse &&
      typeof this.transformResponse === 'function'
    ) {
      return this.transformResponse(res);
    }
    return new Promise(resolve => resolve(res));
  }

  _handleTransformRequest(requestOptions: any): Promise<any> {
    if (this.transformRequest && typeof this.transformRequest === 'function') {
      return this.transformRequest(requestOptions);
    }
    return new Promise(resolve => resolve(requestOptions));
  }

  _handleAggregationResponse(
    aggsResponse: Object,
    options?: Options = defaultOptions
  ) {
    let aggregationField = this.aggregationField;
    if (!aggregationField && typeof this.dataField === 'string') {
      aggregationField = this.dataField;
    }
    const prev = this.aggregationData;
    this.aggregationData.setRaw(aggsResponse[aggregationField]);
    this.aggregationData.setData(
      aggregationField,
      aggsResponse[aggregationField].buckets
    );
    this._applyOptions(
      { stateChanges: options.stateChanges },
      'aggregationData',
      prev,
      this.aggregationData
    );
  }

  _setError(error: any, options?: Options = defaultOptions) {
    this._setRequestStatus(REQUEST_STATUS.error);
    const prev = this.error;
    this.error = error;
    this._applyOptions(options, 'error', prev, this.error);
  }

  _setRequestStatus(requestStatus: RequestStatus) {
    const prev = this.requestStatus;
    this.requestStatus = requestStatus;
    this._applyOptions(
      {
        stateChanges: true
      },
      'requestStatus',
      prev,
      this.requestStatus
    );
  }

  // Method to set the default query value
  _updateQuery(query?: Object): void {
    let prevQuery;
    prevQuery = { ...this._query };
    const finalQuery = [this.componentQuery];
    const flattenReact = flatReactProp(this.react, this.id);
    flattenReact.forEach(id => {
      // only add if not present
      const watcherComponent = this._parent.getComponent(id);
      if (watcherComponent && watcherComponent.value) {
        // Set the execute to `false` for watcher components
        const watcherQuery = watcherComponent.componentQuery;
        watcherQuery.execute = false;
        // Add the query to request payload
        finalQuery.push(watcherQuery);
      }
    });
    this._query = query || finalQuery;
    this._applyOptions(
      {
        stateChanges: false
      },
      'query',
      prevQuery,
      this._query
    );
  }

  // mic
  _handleVoiceResults = (
    { results }: Object,
    options?: Options = defaultOptions
  ) => {
    if (
      results &&
      results[0] &&
      results[0].isFinal &&
      results[0][0] &&
      results[0][0].transcript &&
      results[0][0].transcript.trim()
    ) {
      this.setValue(results[0][0].transcript.trim(), {
        ...options,
        triggerCustomQuery: true,
        triggerDefaultQuery: true
      });
    }
  };

  _stopMic = () => {
    if (this._micInstance) {
      this._micInstance.stop();
      this._micInstance = null;
      this._setMicStatus(MIC_STATUS.inactive);
    }
  };

  _setMicStatus = (
    status: MicStatusField,
    options: Options = defaultOptions
  ) => {
    const prevStatus = this._micStatus;
    this._micStatus = status;
    this._applyOptions(options, 'micStatus', prevStatus, this._micStatus);
  };
}

export default SearchComponent;
