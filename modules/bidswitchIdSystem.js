/**
 * This module adds Bidswitch to the User ID module
 * The {@link module:modules/userId} module is required
 * @module modules/bidswitchSubmodule
 * @requires module:modules/userId
 */

import * as utils from '../src/utils.js'
import { ajax } from '../src/ajax.js';
import { submodule } from '../src/hook.js';
import { getStorageManager } from '../src/storageManager.js';
import { uspDataHandler } from '../src/adapterManager.js';

const MODULE_NAME = 'bidswitchId';
const ID_NAME = 'bsw_id';
const FPID_KEY_NAME = '1st_bsw_uid';

export const storage = getStorageManager();

/** @type {Submodule} */
export const bidswitchSubmodule = {
  /**
   * used to link submodule with config
   * @type {string}
   */
  name: MODULE_NAME,
  /**
   * decode the stored id value for passing to bid requests
   * @function
   * @param {string} value
   * @returns {{bsw_id:string}}
   */
  decode(value) {
    return { [ID_NAME]: value }
  },
  /**
   * performs action to obtain id and return a value in the callback's response argument
   * @function
   * @param {ConsentData} [consentData]
   * @param {SubmoduleConfig} [config]
   * @returns {IdResponse|undefined}
   */
  getId(config, consentData) {
    const configParams = (config && config.params) || {};

    const hasGdpr = (consentData && typeof consentData.gdprApplies === 'boolean' && consentData.gdprApplies) ? 1 : 0;
    const gdprConsentString = hasGdpr ? consentData.consentString : '';
    const uspConsent = uspDataHandler.getConsentData();
    // use protocol relative urls for http or https
    if (hasGdpr && (!gdprConsentString || gdprConsentString === '')) {
      utils.logInfo('Consent string is required to call envelope API.');
      return;
    }
    const firstPartyId = getFirstPartyId();
    const url = `https://grid.bidswitch.net/syncme?1st_party_uid=${firstPartyId}&gdpr=${hasGdpr}&gdpr_consent=${gdprConsentString}&us_privacy=${uspConsent}`;
    //const url = `https://api.rlcdn.com/api/identity/envelope?pid=${configParams.pid}${hasGdpr ? (tcfPolicyV2 ? '&ct=4&cv=' : '&ct=1&cv=') + gdprConsentString : ''}`;
    let resp;
    resp = function (callback) {
      const callbacks = {
        success: response => {
          let responseObj;
          if (response) {
            try {
              responseObj = JSON.parse(response);
            } catch (error) {
              utils.logError(error);
            }
          }
          const {userId, fpId} = responseObj || {};
          if (fpId) {
            setFirstPartyId(fpId);
          }
          callback(userId);
        },
        error: error => {
          utils.logError(`${MODULE_NAME}: bswId fetch encountered an error`, error);
          callback();
        }
      };
      ajax(url, callbacks, undefined, {method: 'GET', withCredentials: true});
    };

    return {callback: resp};
  }
};

function getFirstPartyId() {
  let fpId = storage.localStorageIsEnabled ? storage.getDataFromLocalStorage(FPID_KEY_NAME) : null;
  if (!fpId) {
    fpId = storage.cookiesAreEnabled ? storage.getCookie(FPID_KEY_NAME) : null;
  }
  return fpId || '';
}

function setFirstPartyId(fpId) {
  if (fpId) {
    if (storage.localStorageIsEnabled) {
      storage.setDataInLocalStorage(FPID_KEY_NAME, fpId);
    } else if (storage.cookiesAreEnabled) {
      storage.setCookie(FPID_KEY_NAME, fpId);
    }
  }
}

submodule('userId', bidswitchSubmodule);
