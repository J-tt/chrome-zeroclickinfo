/*
 * Copyright (C) 2012, 2016 DuckDuckGo, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

function Background() {
  $this = this;

  $this.timeSinceEpoch = function() {
      var atbTime = {
              oneWeek     : 604800000,
              oneDay      : 86400000,
              oneHour     : 3600000,
              oneMinute   : 60000,
              estEpoch    : 1456290000000
          },
          localDate = new Date(),
          localTime = localDate.getTime(),
          utcTime = localTime + (localDate.getTimezoneOffset() * atbTime.oneMinute),
          est = new Date(utcTime + (atbTime.oneHour * -5)),
          dstStartDay = 13 - ((est.getFullYear() - 2016) % 6),
          dstStopDay = 6 - ((est.getFullYear() - 2016) % 6),
          isDST = (est.getMonth() > 2 || (est.getMonth() == 2 && est.getDate() >= dstStartDay)) && (est.getMonth() < 10 || (est.getMonth() == 10 && est.getDate() < dstStopDay)),
          epoch = isDST ? atbTime.estEpoch - atbTime.oneHour : atbTime.estEpoch;

      return new Date().getTime() - epoch;
  }

  $this.majorVersion = function() {
      var tse = $this.timeSinceEpoch();
      return Math.ceil( tse / 604800000);
  }

  $this.minorVersion = function() {
      var tse = $this.timeSinceEpoch();
      return Math.ceil( tse % 604800000 / 86400000);
  }

  $this.atbDelta = function(ogMajor, ogMinor) {
      var majorVersion = $this.majorVersion();
          minorVersion = $this.minorVersion();
          majorDiff = majorVersion - ogMajor,
          minorDiff = Math.abs(minorVersion - ogMinor);

      return majorDiff > 0 ? (7 * majorDiff) + minorDiff : minorDiff;
  }


  // clearing last search on browser startup
  localStorage['last_search'] = '';

  var os = "o";
  if (window.navigator.userAgent.indexOf("Windows") != -1) os = "w";
  if (window.navigator.userAgent.indexOf("Mac") != -1) os = "m";
  if (window.navigator.userAgent.indexOf("Linux") != -1) os = "l";

  localStorage['os'] = os;

  browser.runtime.setUninstallURL('https://www.surveymonkey.com/r/7D6LNKM_DOC_0');

  browser.management.onInstalled.addListener(function(details) {
    // only run the following section on install
    if (details.reason !== "install") {
      return;
    }

    if (localStorage['atb'] === undefined) {
        var majorVersion = $this.majorVersion();
            minorVersion = $this.minorVersion();

        localStorage['atb'] = 'v' + majorVersion + '-' + minorVersion;
        localStorage['majorVersion'] = majorVersion;
        localStorage['minorVersion'] = minorVersion;
    }

    // inject the oninstall script to opened DuckDuckGo tab.
    browser.tabs.query({ url: 'https://*.duckduckgo.com/*' }, function (tabs) {
      var i = tabs.length, tab;
      while (i--) {
        tab = tabs[i];
        browser.tabs.executeScript(tab.id, {
          file: 'js/oninstall.js'
        });
        browser.tabs.insertCSS(tab.id, {
          file: 'css/noatb.css'
        });
      }
    });

  });

  browser.runtime.onMessage.addListener(function(request, sender, callback) {
    if (request.options) {
      callback(localStorage);
    }

    if (request.current_url) {
      browser.tabs.getSelected(function(tab) {
        var url = tab.url;
        callback(url);
      });
    }

    if (!localStorage['set_atb'] && request.atb) {
      localStorage['atb'] = request.atb;
      localStorage['set_atb'] = request.atb;

      var xhr = new XMLHttpRequest();

      xhr.open('GET',
        'https://duckduckgo.com/exti/?atb=' + request.atb,
        true
      );
      xhr.send();
    }

    return true;
  });
}

var background = new Background();

browser.alarms.create('updateUninstallURL', {periodInMinutes: 1});

browser.alarms.onAlarm.addListener(function(alarmEvent){
    if (alarmEvent.name === 'updateUninstallURL') {
        var ogMajor = localStorage['majorVersion'],
            ogMinor = localStorage['minorVersion'],
            atbDelta = background.atbDelta(ogMajor, ogMinor),
            uninstallURLParam = atbDelta <= 14 ? atbDelta : 15;

        browser.runtime.setUninstallURL('https://www.surveymonkey.com/r/7D6LNKM_DOC_' + uninstallURLParam);
    }
});

browser.omnibox.onInputEntered.addListener(function(text) {
  browser.tabs.query({
    'currentWindow': true,
    'active': true
  }, function(tabs) {
    browser.tabs.update(tabs[0].id, {
      url: "https://duckduckgo.com/?q=" + encodeURIComponent(text) + "&bext=" + localStorage['os'] + "cl"
    });
  });
});

//This adds Context Menu when user select some text.
//create context menu
browser.contextMenus.create({
  title: 'Search DuckDuckGo for "%s"',
  contexts: ["selection"],
  onclick: function(info) {
    var queryText = info.selectionText;
    browser.tabs.create({
      url: "https://duckduckgo.com/?q=" + queryText + "&bext=" + localStorage['os'] + "cr"
    });
  }
});

// Add ATB param
browser.webRequest.onBeforeRequest.addListener(
    function (e) {
      // Only change the URL if there is no ATB param specified.
      if (e.url.indexOf('atb=') !== -1) {
        return;
      }

      // Only change the URL if there is an ATB saved in localStorage
      if (localStorage['atb'] === undefined) {
        return;
      }

      var newURL = e.url + "&atb=" + localStorage['atb'];
      return {
        redirectUrl: newURL
      };
    },
    {
        urls: [
            "*://duckduckgo.com/?*",
            "*://*.duckduckgo.com/?*",
        ],
        types: ["main_frame"]
    },
    ["blocking"]
);

browser.webRequest.onCompleted.addListener(
    function () {
      var atb = localStorage['atb'],
          setATB = localStorage['set_atb'];

      if (!atb || !setATB) {
        return;
      }

      var xhr = new XMLHttpRequest();

      xhr.onreadystatechange = function() {
        if (xhr.readyState == XMLHttpRequest.DONE) {
           if (xhr.status == 200) {
             var curATB = JSON.parse(xhr.responseText);
             if(curATB.version !== setATB) {
               localStorage['set_atb'] = curATB.version;
             }
           }
        }
      };

      xhr.open('GET',
        'https://duckduckgo.com/atb.js?' + Math.ceil(Math.random() * 1e7)
          + '&atb=' + atb + '&set_atb=' + setATB,
        true
      );
      xhr.send();
    },
    {
        urls: [
            '*://duckduckgo.com/?*',
            '*://*.duckduckgo.com/?*',
        ],
    }
);
