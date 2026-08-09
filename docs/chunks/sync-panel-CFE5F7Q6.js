import {
  QrScanner,
  abortIntake,
  buildBunkerUrlWithClientKey,
  buildNostrpairUrl,
  commitPrepared,
  createIntakeToken,
  isCameraSupported,
  parseNostrpairInput,
  prepareBareKey
} from "./chunk-BE5UTL6I.js";
import "./chunk-MEHHDEEL.js";
import "./chunk-ZI5XKXWT.js";
import {
  detectPlatform,
  ensureRegistered,
  openSecrets
} from "./chunk-35T5INCI.js";
import {
  error,
  info,
  success,
  warning
} from "./chunk-BDYCOPAX.js";
import "./chunk-4RHK4XWQ.js";
import {
  Nip46Client,
  Nip46ServerSession,
  bytesToHex,
  freeRelays,
  generateSecretKey,
  getConversationKey,
  getDeviceSignerPubkey,
  getPublicKey,
  list,
  npubFromPubkey,
  nsecFromHex,
  relayPool
} from "./chunk-KDVVJYRE.js";
import {
  defineLocales,
  getT,
  subscribeLocaleChanged
} from "./chunk-KYIGV7TE.js";
import {
  injectComponentStyles,
  waitForFocus
} from "./chunk-3OYOWZEQ.js";
import {
  __commonJS,
  __toESM
} from "./chunk-NZLE2WMY.js";

// node_modules/qrcode-generator/qrcode.js
var require_qrcode = __commonJS({
  "node_modules/qrcode-generator/qrcode.js"(exports, module) {
    var qrcode2 = (function() {
      var qrcode3 = function(typeNumber, errorCorrectionLevel) {
        var PAD0 = 236;
        var PAD1 = 17;
        var _typeNumber = typeNumber;
        var _errorCorrectionLevel = QRErrorCorrectionLevel[errorCorrectionLevel];
        var _modules = null;
        var _moduleCount = 0;
        var _dataCache = null;
        var _dataList = [];
        var _this = {};
        var makeImpl = function(test, maskPattern) {
          _moduleCount = _typeNumber * 4 + 17;
          _modules = (function(moduleCount) {
            var modules = new Array(moduleCount);
            for (var row = 0; row < moduleCount; row += 1) {
              modules[row] = new Array(moduleCount);
              for (var col = 0; col < moduleCount; col += 1) {
                modules[row][col] = null;
              }
            }
            return modules;
          })(_moduleCount);
          setupPositionProbePattern(0, 0);
          setupPositionProbePattern(_moduleCount - 7, 0);
          setupPositionProbePattern(0, _moduleCount - 7);
          setupPositionAdjustPattern();
          setupTimingPattern();
          setupTypeInfo(test, maskPattern);
          if (_typeNumber >= 7) {
            setupTypeNumber(test);
          }
          if (_dataCache == null) {
            _dataCache = createData(_typeNumber, _errorCorrectionLevel, _dataList);
          }
          mapData(_dataCache, maskPattern);
        };
        var setupPositionProbePattern = function(row, col) {
          for (var r = -1; r <= 7; r += 1) {
            if (row + r <= -1 || _moduleCount <= row + r) continue;
            for (var c = -1; c <= 7; c += 1) {
              if (col + c <= -1 || _moduleCount <= col + c) continue;
              if (0 <= r && r <= 6 && (c == 0 || c == 6) || 0 <= c && c <= 6 && (r == 0 || r == 6) || 2 <= r && r <= 4 && 2 <= c && c <= 4) {
                _modules[row + r][col + c] = true;
              } else {
                _modules[row + r][col + c] = false;
              }
            }
          }
        };
        var getBestMaskPattern = function() {
          var minLostPoint = 0;
          var pattern = 0;
          for (var i = 0; i < 8; i += 1) {
            makeImpl(true, i);
            var lostPoint = QRUtil.getLostPoint(_this);
            if (i == 0 || minLostPoint > lostPoint) {
              minLostPoint = lostPoint;
              pattern = i;
            }
          }
          return pattern;
        };
        var setupTimingPattern = function() {
          for (var r = 8; r < _moduleCount - 8; r += 1) {
            if (_modules[r][6] != null) {
              continue;
            }
            _modules[r][6] = r % 2 == 0;
          }
          for (var c = 8; c < _moduleCount - 8; c += 1) {
            if (_modules[6][c] != null) {
              continue;
            }
            _modules[6][c] = c % 2 == 0;
          }
        };
        var setupPositionAdjustPattern = function() {
          var pos = QRUtil.getPatternPosition(_typeNumber);
          for (var i = 0; i < pos.length; i += 1) {
            for (var j = 0; j < pos.length; j += 1) {
              var row = pos[i];
              var col = pos[j];
              if (_modules[row][col] != null) {
                continue;
              }
              for (var r = -2; r <= 2; r += 1) {
                for (var c = -2; c <= 2; c += 1) {
                  if (r == -2 || r == 2 || c == -2 || c == 2 || r == 0 && c == 0) {
                    _modules[row + r][col + c] = true;
                  } else {
                    _modules[row + r][col + c] = false;
                  }
                }
              }
            }
          }
        };
        var setupTypeNumber = function(test) {
          var bits = QRUtil.getBCHTypeNumber(_typeNumber);
          for (var i = 0; i < 18; i += 1) {
            var mod = !test && (bits >> i & 1) == 1;
            _modules[Math.floor(i / 3)][i % 3 + _moduleCount - 8 - 3] = mod;
          }
          for (var i = 0; i < 18; i += 1) {
            var mod = !test && (bits >> i & 1) == 1;
            _modules[i % 3 + _moduleCount - 8 - 3][Math.floor(i / 3)] = mod;
          }
        };
        var setupTypeInfo = function(test, maskPattern) {
          var data = _errorCorrectionLevel << 3 | maskPattern;
          var bits = QRUtil.getBCHTypeInfo(data);
          for (var i = 0; i < 15; i += 1) {
            var mod = !test && (bits >> i & 1) == 1;
            if (i < 6) {
              _modules[i][8] = mod;
            } else if (i < 8) {
              _modules[i + 1][8] = mod;
            } else {
              _modules[_moduleCount - 15 + i][8] = mod;
            }
          }
          for (var i = 0; i < 15; i += 1) {
            var mod = !test && (bits >> i & 1) == 1;
            if (i < 8) {
              _modules[8][_moduleCount - i - 1] = mod;
            } else if (i < 9) {
              _modules[8][15 - i - 1 + 1] = mod;
            } else {
              _modules[8][15 - i - 1] = mod;
            }
          }
          _modules[_moduleCount - 8][8] = !test;
        };
        var mapData = function(data, maskPattern) {
          var inc = -1;
          var row = _moduleCount - 1;
          var bitIndex = 7;
          var byteIndex = 0;
          var maskFunc = QRUtil.getMaskFunction(maskPattern);
          for (var col = _moduleCount - 1; col > 0; col -= 2) {
            if (col == 6) col -= 1;
            while (true) {
              for (var c = 0; c < 2; c += 1) {
                if (_modules[row][col - c] == null) {
                  var dark = false;
                  if (byteIndex < data.length) {
                    dark = (data[byteIndex] >>> bitIndex & 1) == 1;
                  }
                  var mask = maskFunc(row, col - c);
                  if (mask) {
                    dark = !dark;
                  }
                  _modules[row][col - c] = dark;
                  bitIndex -= 1;
                  if (bitIndex == -1) {
                    byteIndex += 1;
                    bitIndex = 7;
                  }
                }
              }
              row += inc;
              if (row < 0 || _moduleCount <= row) {
                row -= inc;
                inc = -inc;
                break;
              }
            }
          }
        };
        var createBytes = function(buffer, rsBlocks) {
          var offset = 0;
          var maxDcCount = 0;
          var maxEcCount = 0;
          var dcdata = new Array(rsBlocks.length);
          var ecdata = new Array(rsBlocks.length);
          for (var r = 0; r < rsBlocks.length; r += 1) {
            var dcCount = rsBlocks[r].dataCount;
            var ecCount = rsBlocks[r].totalCount - dcCount;
            maxDcCount = Math.max(maxDcCount, dcCount);
            maxEcCount = Math.max(maxEcCount, ecCount);
            dcdata[r] = new Array(dcCount);
            for (var i = 0; i < dcdata[r].length; i += 1) {
              dcdata[r][i] = 255 & buffer.getBuffer()[i + offset];
            }
            offset += dcCount;
            var rsPoly = QRUtil.getErrorCorrectPolynomial(ecCount);
            var rawPoly = qrPolynomial(dcdata[r], rsPoly.getLength() - 1);
            var modPoly = rawPoly.mod(rsPoly);
            ecdata[r] = new Array(rsPoly.getLength() - 1);
            for (var i = 0; i < ecdata[r].length; i += 1) {
              var modIndex = i + modPoly.getLength() - ecdata[r].length;
              ecdata[r][i] = modIndex >= 0 ? modPoly.getAt(modIndex) : 0;
            }
          }
          var totalCodeCount = 0;
          for (var i = 0; i < rsBlocks.length; i += 1) {
            totalCodeCount += rsBlocks[i].totalCount;
          }
          var data = new Array(totalCodeCount);
          var index = 0;
          for (var i = 0; i < maxDcCount; i += 1) {
            for (var r = 0; r < rsBlocks.length; r += 1) {
              if (i < dcdata[r].length) {
                data[index] = dcdata[r][i];
                index += 1;
              }
            }
          }
          for (var i = 0; i < maxEcCount; i += 1) {
            for (var r = 0; r < rsBlocks.length; r += 1) {
              if (i < ecdata[r].length) {
                data[index] = ecdata[r][i];
                index += 1;
              }
            }
          }
          return data;
        };
        var createData = function(typeNumber2, errorCorrectionLevel2, dataList) {
          var rsBlocks = QRRSBlock.getRSBlocks(typeNumber2, errorCorrectionLevel2);
          var buffer = qrBitBuffer();
          for (var i = 0; i < dataList.length; i += 1) {
            var data = dataList[i];
            buffer.put(data.getMode(), 4);
            buffer.put(data.getLength(), QRUtil.getLengthInBits(data.getMode(), typeNumber2));
            data.write(buffer);
          }
          var totalDataCount = 0;
          for (var i = 0; i < rsBlocks.length; i += 1) {
            totalDataCount += rsBlocks[i].dataCount;
          }
          if (buffer.getLengthInBits() > totalDataCount * 8) {
            throw "code length overflow. (" + buffer.getLengthInBits() + ">" + totalDataCount * 8 + ")";
          }
          if (buffer.getLengthInBits() + 4 <= totalDataCount * 8) {
            buffer.put(0, 4);
          }
          while (buffer.getLengthInBits() % 8 != 0) {
            buffer.putBit(false);
          }
          while (true) {
            if (buffer.getLengthInBits() >= totalDataCount * 8) {
              break;
            }
            buffer.put(PAD0, 8);
            if (buffer.getLengthInBits() >= totalDataCount * 8) {
              break;
            }
            buffer.put(PAD1, 8);
          }
          return createBytes(buffer, rsBlocks);
        };
        _this.addData = function(data, mode) {
          mode = mode || "Byte";
          var newData = null;
          switch (mode) {
            case "Numeric":
              newData = qrNumber(data);
              break;
            case "Alphanumeric":
              newData = qrAlphaNum(data);
              break;
            case "Byte":
              newData = qr8BitByte(data);
              break;
            case "Kanji":
              newData = qrKanji(data);
              break;
            default:
              throw "mode:" + mode;
          }
          _dataList.push(newData);
          _dataCache = null;
        };
        _this.isDark = function(row, col) {
          if (row < 0 || _moduleCount <= row || col < 0 || _moduleCount <= col) {
            throw row + "," + col;
          }
          return _modules[row][col];
        };
        _this.getModuleCount = function() {
          return _moduleCount;
        };
        _this.make = function() {
          if (_typeNumber < 1) {
            var typeNumber2 = 1;
            for (; typeNumber2 < 40; typeNumber2++) {
              var rsBlocks = QRRSBlock.getRSBlocks(typeNumber2, _errorCorrectionLevel);
              var buffer = qrBitBuffer();
              for (var i = 0; i < _dataList.length; i++) {
                var data = _dataList[i];
                buffer.put(data.getMode(), 4);
                buffer.put(data.getLength(), QRUtil.getLengthInBits(data.getMode(), typeNumber2));
                data.write(buffer);
              }
              var totalDataCount = 0;
              for (var i = 0; i < rsBlocks.length; i++) {
                totalDataCount += rsBlocks[i].dataCount;
              }
              if (buffer.getLengthInBits() <= totalDataCount * 8) {
                break;
              }
            }
            _typeNumber = typeNumber2;
          }
          makeImpl(false, getBestMaskPattern());
        };
        _this.createTableTag = function(cellSize, margin) {
          cellSize = cellSize || 2;
          margin = typeof margin == "undefined" ? cellSize * 4 : margin;
          var qrHtml = "";
          qrHtml += '<table style="';
          qrHtml += " border-width: 0px; border-style: none;";
          qrHtml += " border-collapse: collapse;";
          qrHtml += " padding: 0px; margin: " + margin + "px;";
          qrHtml += '">';
          qrHtml += "<tbody>";
          for (var r = 0; r < _this.getModuleCount(); r += 1) {
            qrHtml += "<tr>";
            for (var c = 0; c < _this.getModuleCount(); c += 1) {
              qrHtml += '<td style="';
              qrHtml += " border-width: 0px; border-style: none;";
              qrHtml += " border-collapse: collapse;";
              qrHtml += " padding: 0px; margin: 0px;";
              qrHtml += " width: " + cellSize + "px;";
              qrHtml += " height: " + cellSize + "px;";
              qrHtml += " background-color: ";
              qrHtml += _this.isDark(r, c) ? "#000000" : "#ffffff";
              qrHtml += ";";
              qrHtml += '"/>';
            }
            qrHtml += "</tr>";
          }
          qrHtml += "</tbody>";
          qrHtml += "</table>";
          return qrHtml;
        };
        _this.createSvgTag = function(cellSize, margin, alt, title) {
          var opts = {};
          if (typeof arguments[0] == "object") {
            opts = arguments[0];
            cellSize = opts.cellSize;
            margin = opts.margin;
            alt = opts.alt;
            title = opts.title;
          }
          cellSize = cellSize || 2;
          margin = typeof margin == "undefined" ? cellSize * 4 : margin;
          alt = typeof alt === "string" ? { text: alt } : alt || {};
          alt.text = alt.text || null;
          alt.id = alt.text ? alt.id || "qrcode-description" : null;
          title = typeof title === "string" ? { text: title } : title || {};
          title.text = title.text || null;
          title.id = title.text ? title.id || "qrcode-title" : null;
          var size = _this.getModuleCount() * cellSize + margin * 2;
          var c, mc, r, mr, qrSvg = "", rect;
          rect = "l" + cellSize + ",0 0," + cellSize + " -" + cellSize + ",0 0,-" + cellSize + "z ";
          qrSvg += '<svg version="1.1" xmlns="http://www.w3.org/2000/svg"';
          qrSvg += !opts.scalable ? ' width="' + size + 'px" height="' + size + 'px"' : "";
          qrSvg += ' viewBox="0 0 ' + size + " " + size + '" ';
          qrSvg += ' preserveAspectRatio="xMinYMin meet"';
          qrSvg += title.text || alt.text ? ' role="img" aria-labelledby="' + escapeXml([title.id, alt.id].join(" ").trim()) + '"' : "";
          qrSvg += ">";
          qrSvg += title.text ? '<title id="' + escapeXml(title.id) + '">' + escapeXml(title.text) + "</title>" : "";
          qrSvg += alt.text ? '<description id="' + escapeXml(alt.id) + '">' + escapeXml(alt.text) + "</description>" : "";
          qrSvg += '<rect width="100%" height="100%" fill="white" cx="0" cy="0"/>';
          qrSvg += '<path d="';
          for (r = 0; r < _this.getModuleCount(); r += 1) {
            mr = r * cellSize + margin;
            for (c = 0; c < _this.getModuleCount(); c += 1) {
              if (_this.isDark(r, c)) {
                mc = c * cellSize + margin;
                qrSvg += "M" + mc + "," + mr + rect;
              }
            }
          }
          qrSvg += '" stroke="transparent" fill="black"/>';
          qrSvg += "</svg>";
          return qrSvg;
        };
        _this.createDataURL = function(cellSize, margin) {
          cellSize = cellSize || 2;
          margin = typeof margin == "undefined" ? cellSize * 4 : margin;
          var size = _this.getModuleCount() * cellSize + margin * 2;
          var min = margin;
          var max = size - margin;
          return createDataURL(size, size, function(x, y) {
            if (min <= x && x < max && min <= y && y < max) {
              var c = Math.floor((x - min) / cellSize);
              var r = Math.floor((y - min) / cellSize);
              return _this.isDark(r, c) ? 0 : 1;
            } else {
              return 1;
            }
          });
        };
        _this.createImgTag = function(cellSize, margin, alt) {
          cellSize = cellSize || 2;
          margin = typeof margin == "undefined" ? cellSize * 4 : margin;
          var size = _this.getModuleCount() * cellSize + margin * 2;
          var img = "";
          img += "<img";
          img += ' src="';
          img += _this.createDataURL(cellSize, margin);
          img += '"';
          img += ' width="';
          img += size;
          img += '"';
          img += ' height="';
          img += size;
          img += '"';
          if (alt) {
            img += ' alt="';
            img += escapeXml(alt);
            img += '"';
          }
          img += "/>";
          return img;
        };
        var escapeXml = function(s) {
          var escaped = "";
          for (var i = 0; i < s.length; i += 1) {
            var c = s.charAt(i);
            switch (c) {
              case "<":
                escaped += "&lt;";
                break;
              case ">":
                escaped += "&gt;";
                break;
              case "&":
                escaped += "&amp;";
                break;
              case '"':
                escaped += "&quot;";
                break;
              default:
                escaped += c;
                break;
            }
          }
          return escaped;
        };
        var _createHalfASCII = function(margin) {
          var cellSize = 1;
          margin = typeof margin == "undefined" ? cellSize * 2 : margin;
          var size = _this.getModuleCount() * cellSize + margin * 2;
          var min = margin;
          var max = size - margin;
          var y, x, r1, r2, p;
          var blocks = {
            "\u2588\u2588": "\u2588",
            "\u2588 ": "\u2580",
            " \u2588": "\u2584",
            "  ": " "
          };
          var blocksLastLineNoMargin = {
            "\u2588\u2588": "\u2580",
            "\u2588 ": "\u2580",
            " \u2588": " ",
            "  ": " "
          };
          var ascii = "";
          for (y = 0; y < size; y += 2) {
            r1 = Math.floor((y - min) / cellSize);
            r2 = Math.floor((y + 1 - min) / cellSize);
            for (x = 0; x < size; x += 1) {
              p = "\u2588";
              if (min <= x && x < max && min <= y && y < max && _this.isDark(r1, Math.floor((x - min) / cellSize))) {
                p = " ";
              }
              if (min <= x && x < max && min <= y + 1 && y + 1 < max && _this.isDark(r2, Math.floor((x - min) / cellSize))) {
                p += " ";
              } else {
                p += "\u2588";
              }
              ascii += margin < 1 && y + 1 >= max ? blocksLastLineNoMargin[p] : blocks[p];
            }
            ascii += "\n";
          }
          if (size % 2 && margin > 0) {
            return ascii.substring(0, ascii.length - size - 1) + Array(size + 1).join("\u2580");
          }
          return ascii.substring(0, ascii.length - 1);
        };
        _this.createASCII = function(cellSize, margin) {
          cellSize = cellSize || 1;
          if (cellSize < 2) {
            return _createHalfASCII(margin);
          }
          cellSize -= 1;
          margin = typeof margin == "undefined" ? cellSize * 2 : margin;
          var size = _this.getModuleCount() * cellSize + margin * 2;
          var min = margin;
          var max = size - margin;
          var y, x, r, p;
          var white = Array(cellSize + 1).join("\u2588\u2588");
          var black = Array(cellSize + 1).join("  ");
          var ascii = "";
          var line = "";
          for (y = 0; y < size; y += 1) {
            r = Math.floor((y - min) / cellSize);
            line = "";
            for (x = 0; x < size; x += 1) {
              p = 1;
              if (min <= x && x < max && min <= y && y < max && _this.isDark(r, Math.floor((x - min) / cellSize))) {
                p = 0;
              }
              line += p ? white : black;
            }
            for (r = 0; r < cellSize; r += 1) {
              ascii += line + "\n";
            }
          }
          return ascii.substring(0, ascii.length - 1);
        };
        _this.renderTo2dContext = function(context, cellSize) {
          cellSize = cellSize || 2;
          var length = _this.getModuleCount();
          for (var row = 0; row < length; row++) {
            for (var col = 0; col < length; col++) {
              context.fillStyle = _this.isDark(row, col) ? "black" : "white";
              context.fillRect(row * cellSize, col * cellSize, cellSize, cellSize);
            }
          }
        };
        return _this;
      };
      qrcode3.stringToBytesFuncs = {
        "default": function(s) {
          var bytes = [];
          for (var i = 0; i < s.length; i += 1) {
            var c = s.charCodeAt(i);
            bytes.push(c & 255);
          }
          return bytes;
        }
      };
      qrcode3.stringToBytes = qrcode3.stringToBytesFuncs["default"];
      qrcode3.createStringToBytes = function(unicodeData, numChars) {
        var unicodeMap = (function() {
          var bin = base64DecodeInputStream(unicodeData);
          var read = function() {
            var b = bin.read();
            if (b == -1) throw "eof";
            return b;
          };
          var count = 0;
          var unicodeMap2 = {};
          while (true) {
            var b0 = bin.read();
            if (b0 == -1) break;
            var b1 = read();
            var b2 = read();
            var b3 = read();
            var k = String.fromCharCode(b0 << 8 | b1);
            var v = b2 << 8 | b3;
            unicodeMap2[k] = v;
            count += 1;
          }
          if (count != numChars) {
            throw count + " != " + numChars;
          }
          return unicodeMap2;
        })();
        var unknownChar = "?".charCodeAt(0);
        return function(s) {
          var bytes = [];
          for (var i = 0; i < s.length; i += 1) {
            var c = s.charCodeAt(i);
            if (c < 128) {
              bytes.push(c);
            } else {
              var b = unicodeMap[s.charAt(i)];
              if (typeof b == "number") {
                if ((b & 255) == b) {
                  bytes.push(b);
                } else {
                  bytes.push(b >>> 8);
                  bytes.push(b & 255);
                }
              } else {
                bytes.push(unknownChar);
              }
            }
          }
          return bytes;
        };
      };
      var QRMode = {
        MODE_NUMBER: 1 << 0,
        MODE_ALPHA_NUM: 1 << 1,
        MODE_8BIT_BYTE: 1 << 2,
        MODE_KANJI: 1 << 3
      };
      var QRErrorCorrectionLevel = {
        L: 1,
        M: 0,
        Q: 3,
        H: 2
      };
      var QRMaskPattern = {
        PATTERN000: 0,
        PATTERN001: 1,
        PATTERN010: 2,
        PATTERN011: 3,
        PATTERN100: 4,
        PATTERN101: 5,
        PATTERN110: 6,
        PATTERN111: 7
      };
      var QRUtil = (function() {
        var PATTERN_POSITION_TABLE = [
          [],
          [6, 18],
          [6, 22],
          [6, 26],
          [6, 30],
          [6, 34],
          [6, 22, 38],
          [6, 24, 42],
          [6, 26, 46],
          [6, 28, 50],
          [6, 30, 54],
          [6, 32, 58],
          [6, 34, 62],
          [6, 26, 46, 66],
          [6, 26, 48, 70],
          [6, 26, 50, 74],
          [6, 30, 54, 78],
          [6, 30, 56, 82],
          [6, 30, 58, 86],
          [6, 34, 62, 90],
          [6, 28, 50, 72, 94],
          [6, 26, 50, 74, 98],
          [6, 30, 54, 78, 102],
          [6, 28, 54, 80, 106],
          [6, 32, 58, 84, 110],
          [6, 30, 58, 86, 114],
          [6, 34, 62, 90, 118],
          [6, 26, 50, 74, 98, 122],
          [6, 30, 54, 78, 102, 126],
          [6, 26, 52, 78, 104, 130],
          [6, 30, 56, 82, 108, 134],
          [6, 34, 60, 86, 112, 138],
          [6, 30, 58, 86, 114, 142],
          [6, 34, 62, 90, 118, 146],
          [6, 30, 54, 78, 102, 126, 150],
          [6, 24, 50, 76, 102, 128, 154],
          [6, 28, 54, 80, 106, 132, 158],
          [6, 32, 58, 84, 110, 136, 162],
          [6, 26, 54, 82, 110, 138, 166],
          [6, 30, 58, 86, 114, 142, 170]
        ];
        var G15 = 1 << 10 | 1 << 8 | 1 << 5 | 1 << 4 | 1 << 2 | 1 << 1 | 1 << 0;
        var G18 = 1 << 12 | 1 << 11 | 1 << 10 | 1 << 9 | 1 << 8 | 1 << 5 | 1 << 2 | 1 << 0;
        var G15_MASK = 1 << 14 | 1 << 12 | 1 << 10 | 1 << 4 | 1 << 1;
        var _this = {};
        var getBCHDigit = function(data) {
          var digit = 0;
          while (data != 0) {
            digit += 1;
            data >>>= 1;
          }
          return digit;
        };
        _this.getBCHTypeInfo = function(data) {
          var d = data << 10;
          while (getBCHDigit(d) - getBCHDigit(G15) >= 0) {
            d ^= G15 << getBCHDigit(d) - getBCHDigit(G15);
          }
          return (data << 10 | d) ^ G15_MASK;
        };
        _this.getBCHTypeNumber = function(data) {
          var d = data << 12;
          while (getBCHDigit(d) - getBCHDigit(G18) >= 0) {
            d ^= G18 << getBCHDigit(d) - getBCHDigit(G18);
          }
          return data << 12 | d;
        };
        _this.getPatternPosition = function(typeNumber) {
          return PATTERN_POSITION_TABLE[typeNumber - 1];
        };
        _this.getMaskFunction = function(maskPattern) {
          switch (maskPattern) {
            case QRMaskPattern.PATTERN000:
              return function(i, j) {
                return (i + j) % 2 == 0;
              };
            case QRMaskPattern.PATTERN001:
              return function(i, j) {
                return i % 2 == 0;
              };
            case QRMaskPattern.PATTERN010:
              return function(i, j) {
                return j % 3 == 0;
              };
            case QRMaskPattern.PATTERN011:
              return function(i, j) {
                return (i + j) % 3 == 0;
              };
            case QRMaskPattern.PATTERN100:
              return function(i, j) {
                return (Math.floor(i / 2) + Math.floor(j / 3)) % 2 == 0;
              };
            case QRMaskPattern.PATTERN101:
              return function(i, j) {
                return i * j % 2 + i * j % 3 == 0;
              };
            case QRMaskPattern.PATTERN110:
              return function(i, j) {
                return (i * j % 2 + i * j % 3) % 2 == 0;
              };
            case QRMaskPattern.PATTERN111:
              return function(i, j) {
                return (i * j % 3 + (i + j) % 2) % 2 == 0;
              };
            default:
              throw "bad maskPattern:" + maskPattern;
          }
        };
        _this.getErrorCorrectPolynomial = function(errorCorrectLength) {
          var a = qrPolynomial([1], 0);
          for (var i = 0; i < errorCorrectLength; i += 1) {
            a = a.multiply(qrPolynomial([1, QRMath.gexp(i)], 0));
          }
          return a;
        };
        _this.getLengthInBits = function(mode, type) {
          if (1 <= type && type < 10) {
            switch (mode) {
              case QRMode.MODE_NUMBER:
                return 10;
              case QRMode.MODE_ALPHA_NUM:
                return 9;
              case QRMode.MODE_8BIT_BYTE:
                return 8;
              case QRMode.MODE_KANJI:
                return 8;
              default:
                throw "mode:" + mode;
            }
          } else if (type < 27) {
            switch (mode) {
              case QRMode.MODE_NUMBER:
                return 12;
              case QRMode.MODE_ALPHA_NUM:
                return 11;
              case QRMode.MODE_8BIT_BYTE:
                return 16;
              case QRMode.MODE_KANJI:
                return 10;
              default:
                throw "mode:" + mode;
            }
          } else if (type < 41) {
            switch (mode) {
              case QRMode.MODE_NUMBER:
                return 14;
              case QRMode.MODE_ALPHA_NUM:
                return 13;
              case QRMode.MODE_8BIT_BYTE:
                return 16;
              case QRMode.MODE_KANJI:
                return 12;
              default:
                throw "mode:" + mode;
            }
          } else {
            throw "type:" + type;
          }
        };
        _this.getLostPoint = function(qrcode4) {
          var moduleCount = qrcode4.getModuleCount();
          var lostPoint = 0;
          for (var row = 0; row < moduleCount; row += 1) {
            for (var col = 0; col < moduleCount; col += 1) {
              var sameCount = 0;
              var dark = qrcode4.isDark(row, col);
              for (var r = -1; r <= 1; r += 1) {
                if (row + r < 0 || moduleCount <= row + r) {
                  continue;
                }
                for (var c = -1; c <= 1; c += 1) {
                  if (col + c < 0 || moduleCount <= col + c) {
                    continue;
                  }
                  if (r == 0 && c == 0) {
                    continue;
                  }
                  if (dark == qrcode4.isDark(row + r, col + c)) {
                    sameCount += 1;
                  }
                }
              }
              if (sameCount > 5) {
                lostPoint += 3 + sameCount - 5;
              }
            }
          }
          ;
          for (var row = 0; row < moduleCount - 1; row += 1) {
            for (var col = 0; col < moduleCount - 1; col += 1) {
              var count = 0;
              if (qrcode4.isDark(row, col)) count += 1;
              if (qrcode4.isDark(row + 1, col)) count += 1;
              if (qrcode4.isDark(row, col + 1)) count += 1;
              if (qrcode4.isDark(row + 1, col + 1)) count += 1;
              if (count == 0 || count == 4) {
                lostPoint += 3;
              }
            }
          }
          for (var row = 0; row < moduleCount; row += 1) {
            for (var col = 0; col < moduleCount - 6; col += 1) {
              if (qrcode4.isDark(row, col) && !qrcode4.isDark(row, col + 1) && qrcode4.isDark(row, col + 2) && qrcode4.isDark(row, col + 3) && qrcode4.isDark(row, col + 4) && !qrcode4.isDark(row, col + 5) && qrcode4.isDark(row, col + 6)) {
                lostPoint += 40;
              }
            }
          }
          for (var col = 0; col < moduleCount; col += 1) {
            for (var row = 0; row < moduleCount - 6; row += 1) {
              if (qrcode4.isDark(row, col) && !qrcode4.isDark(row + 1, col) && qrcode4.isDark(row + 2, col) && qrcode4.isDark(row + 3, col) && qrcode4.isDark(row + 4, col) && !qrcode4.isDark(row + 5, col) && qrcode4.isDark(row + 6, col)) {
                lostPoint += 40;
              }
            }
          }
          var darkCount = 0;
          for (var col = 0; col < moduleCount; col += 1) {
            for (var row = 0; row < moduleCount; row += 1) {
              if (qrcode4.isDark(row, col)) {
                darkCount += 1;
              }
            }
          }
          var ratio = Math.abs(100 * darkCount / moduleCount / moduleCount - 50) / 5;
          lostPoint += ratio * 10;
          return lostPoint;
        };
        return _this;
      })();
      var QRMath = (function() {
        var EXP_TABLE = new Array(256);
        var LOG_TABLE = new Array(256);
        for (var i = 0; i < 8; i += 1) {
          EXP_TABLE[i] = 1 << i;
        }
        for (var i = 8; i < 256; i += 1) {
          EXP_TABLE[i] = EXP_TABLE[i - 4] ^ EXP_TABLE[i - 5] ^ EXP_TABLE[i - 6] ^ EXP_TABLE[i - 8];
        }
        for (var i = 0; i < 255; i += 1) {
          LOG_TABLE[EXP_TABLE[i]] = i;
        }
        var _this = {};
        _this.glog = function(n) {
          if (n < 1) {
            throw "glog(" + n + ")";
          }
          return LOG_TABLE[n];
        };
        _this.gexp = function(n) {
          while (n < 0) {
            n += 255;
          }
          while (n >= 256) {
            n -= 255;
          }
          return EXP_TABLE[n];
        };
        return _this;
      })();
      function qrPolynomial(num, shift) {
        if (typeof num.length == "undefined") {
          throw num.length + "/" + shift;
        }
        var _num = (function() {
          var offset = 0;
          while (offset < num.length && num[offset] == 0) {
            offset += 1;
          }
          var _num2 = new Array(num.length - offset + shift);
          for (var i = 0; i < num.length - offset; i += 1) {
            _num2[i] = num[i + offset];
          }
          return _num2;
        })();
        var _this = {};
        _this.getAt = function(index) {
          return _num[index];
        };
        _this.getLength = function() {
          return _num.length;
        };
        _this.multiply = function(e) {
          var num2 = new Array(_this.getLength() + e.getLength() - 1);
          for (var i = 0; i < _this.getLength(); i += 1) {
            for (var j = 0; j < e.getLength(); j += 1) {
              num2[i + j] ^= QRMath.gexp(QRMath.glog(_this.getAt(i)) + QRMath.glog(e.getAt(j)));
            }
          }
          return qrPolynomial(num2, 0);
        };
        _this.mod = function(e) {
          if (_this.getLength() - e.getLength() < 0) {
            return _this;
          }
          var ratio = QRMath.glog(_this.getAt(0)) - QRMath.glog(e.getAt(0));
          var num2 = new Array(_this.getLength());
          for (var i = 0; i < _this.getLength(); i += 1) {
            num2[i] = _this.getAt(i);
          }
          for (var i = 0; i < e.getLength(); i += 1) {
            num2[i] ^= QRMath.gexp(QRMath.glog(e.getAt(i)) + ratio);
          }
          return qrPolynomial(num2, 0).mod(e);
        };
        return _this;
      }
      ;
      var QRRSBlock = (function() {
        var RS_BLOCK_TABLE = [
          // L
          // M
          // Q
          // H
          // 1
          [1, 26, 19],
          [1, 26, 16],
          [1, 26, 13],
          [1, 26, 9],
          // 2
          [1, 44, 34],
          [1, 44, 28],
          [1, 44, 22],
          [1, 44, 16],
          // 3
          [1, 70, 55],
          [1, 70, 44],
          [2, 35, 17],
          [2, 35, 13],
          // 4
          [1, 100, 80],
          [2, 50, 32],
          [2, 50, 24],
          [4, 25, 9],
          // 5
          [1, 134, 108],
          [2, 67, 43],
          [2, 33, 15, 2, 34, 16],
          [2, 33, 11, 2, 34, 12],
          // 6
          [2, 86, 68],
          [4, 43, 27],
          [4, 43, 19],
          [4, 43, 15],
          // 7
          [2, 98, 78],
          [4, 49, 31],
          [2, 32, 14, 4, 33, 15],
          [4, 39, 13, 1, 40, 14],
          // 8
          [2, 121, 97],
          [2, 60, 38, 2, 61, 39],
          [4, 40, 18, 2, 41, 19],
          [4, 40, 14, 2, 41, 15],
          // 9
          [2, 146, 116],
          [3, 58, 36, 2, 59, 37],
          [4, 36, 16, 4, 37, 17],
          [4, 36, 12, 4, 37, 13],
          // 10
          [2, 86, 68, 2, 87, 69],
          [4, 69, 43, 1, 70, 44],
          [6, 43, 19, 2, 44, 20],
          [6, 43, 15, 2, 44, 16],
          // 11
          [4, 101, 81],
          [1, 80, 50, 4, 81, 51],
          [4, 50, 22, 4, 51, 23],
          [3, 36, 12, 8, 37, 13],
          // 12
          [2, 116, 92, 2, 117, 93],
          [6, 58, 36, 2, 59, 37],
          [4, 46, 20, 6, 47, 21],
          [7, 42, 14, 4, 43, 15],
          // 13
          [4, 133, 107],
          [8, 59, 37, 1, 60, 38],
          [8, 44, 20, 4, 45, 21],
          [12, 33, 11, 4, 34, 12],
          // 14
          [3, 145, 115, 1, 146, 116],
          [4, 64, 40, 5, 65, 41],
          [11, 36, 16, 5, 37, 17],
          [11, 36, 12, 5, 37, 13],
          // 15
          [5, 109, 87, 1, 110, 88],
          [5, 65, 41, 5, 66, 42],
          [5, 54, 24, 7, 55, 25],
          [11, 36, 12, 7, 37, 13],
          // 16
          [5, 122, 98, 1, 123, 99],
          [7, 73, 45, 3, 74, 46],
          [15, 43, 19, 2, 44, 20],
          [3, 45, 15, 13, 46, 16],
          // 17
          [1, 135, 107, 5, 136, 108],
          [10, 74, 46, 1, 75, 47],
          [1, 50, 22, 15, 51, 23],
          [2, 42, 14, 17, 43, 15],
          // 18
          [5, 150, 120, 1, 151, 121],
          [9, 69, 43, 4, 70, 44],
          [17, 50, 22, 1, 51, 23],
          [2, 42, 14, 19, 43, 15],
          // 19
          [3, 141, 113, 4, 142, 114],
          [3, 70, 44, 11, 71, 45],
          [17, 47, 21, 4, 48, 22],
          [9, 39, 13, 16, 40, 14],
          // 20
          [3, 135, 107, 5, 136, 108],
          [3, 67, 41, 13, 68, 42],
          [15, 54, 24, 5, 55, 25],
          [15, 43, 15, 10, 44, 16],
          // 21
          [4, 144, 116, 4, 145, 117],
          [17, 68, 42],
          [17, 50, 22, 6, 51, 23],
          [19, 46, 16, 6, 47, 17],
          // 22
          [2, 139, 111, 7, 140, 112],
          [17, 74, 46],
          [7, 54, 24, 16, 55, 25],
          [34, 37, 13],
          // 23
          [4, 151, 121, 5, 152, 122],
          [4, 75, 47, 14, 76, 48],
          [11, 54, 24, 14, 55, 25],
          [16, 45, 15, 14, 46, 16],
          // 24
          [6, 147, 117, 4, 148, 118],
          [6, 73, 45, 14, 74, 46],
          [11, 54, 24, 16, 55, 25],
          [30, 46, 16, 2, 47, 17],
          // 25
          [8, 132, 106, 4, 133, 107],
          [8, 75, 47, 13, 76, 48],
          [7, 54, 24, 22, 55, 25],
          [22, 45, 15, 13, 46, 16],
          // 26
          [10, 142, 114, 2, 143, 115],
          [19, 74, 46, 4, 75, 47],
          [28, 50, 22, 6, 51, 23],
          [33, 46, 16, 4, 47, 17],
          // 27
          [8, 152, 122, 4, 153, 123],
          [22, 73, 45, 3, 74, 46],
          [8, 53, 23, 26, 54, 24],
          [12, 45, 15, 28, 46, 16],
          // 28
          [3, 147, 117, 10, 148, 118],
          [3, 73, 45, 23, 74, 46],
          [4, 54, 24, 31, 55, 25],
          [11, 45, 15, 31, 46, 16],
          // 29
          [7, 146, 116, 7, 147, 117],
          [21, 73, 45, 7, 74, 46],
          [1, 53, 23, 37, 54, 24],
          [19, 45, 15, 26, 46, 16],
          // 30
          [5, 145, 115, 10, 146, 116],
          [19, 75, 47, 10, 76, 48],
          [15, 54, 24, 25, 55, 25],
          [23, 45, 15, 25, 46, 16],
          // 31
          [13, 145, 115, 3, 146, 116],
          [2, 74, 46, 29, 75, 47],
          [42, 54, 24, 1, 55, 25],
          [23, 45, 15, 28, 46, 16],
          // 32
          [17, 145, 115],
          [10, 74, 46, 23, 75, 47],
          [10, 54, 24, 35, 55, 25],
          [19, 45, 15, 35, 46, 16],
          // 33
          [17, 145, 115, 1, 146, 116],
          [14, 74, 46, 21, 75, 47],
          [29, 54, 24, 19, 55, 25],
          [11, 45, 15, 46, 46, 16],
          // 34
          [13, 145, 115, 6, 146, 116],
          [14, 74, 46, 23, 75, 47],
          [44, 54, 24, 7, 55, 25],
          [59, 46, 16, 1, 47, 17],
          // 35
          [12, 151, 121, 7, 152, 122],
          [12, 75, 47, 26, 76, 48],
          [39, 54, 24, 14, 55, 25],
          [22, 45, 15, 41, 46, 16],
          // 36
          [6, 151, 121, 14, 152, 122],
          [6, 75, 47, 34, 76, 48],
          [46, 54, 24, 10, 55, 25],
          [2, 45, 15, 64, 46, 16],
          // 37
          [17, 152, 122, 4, 153, 123],
          [29, 74, 46, 14, 75, 47],
          [49, 54, 24, 10, 55, 25],
          [24, 45, 15, 46, 46, 16],
          // 38
          [4, 152, 122, 18, 153, 123],
          [13, 74, 46, 32, 75, 47],
          [48, 54, 24, 14, 55, 25],
          [42, 45, 15, 32, 46, 16],
          // 39
          [20, 147, 117, 4, 148, 118],
          [40, 75, 47, 7, 76, 48],
          [43, 54, 24, 22, 55, 25],
          [10, 45, 15, 67, 46, 16],
          // 40
          [19, 148, 118, 6, 149, 119],
          [18, 75, 47, 31, 76, 48],
          [34, 54, 24, 34, 55, 25],
          [20, 45, 15, 61, 46, 16]
        ];
        var qrRSBlock = function(totalCount, dataCount) {
          var _this2 = {};
          _this2.totalCount = totalCount;
          _this2.dataCount = dataCount;
          return _this2;
        };
        var _this = {};
        var getRsBlockTable = function(typeNumber, errorCorrectionLevel) {
          switch (errorCorrectionLevel) {
            case QRErrorCorrectionLevel.L:
              return RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 0];
            case QRErrorCorrectionLevel.M:
              return RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 1];
            case QRErrorCorrectionLevel.Q:
              return RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 2];
            case QRErrorCorrectionLevel.H:
              return RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 3];
            default:
              return void 0;
          }
        };
        _this.getRSBlocks = function(typeNumber, errorCorrectionLevel) {
          var rsBlock = getRsBlockTable(typeNumber, errorCorrectionLevel);
          if (typeof rsBlock == "undefined") {
            throw "bad rs block @ typeNumber:" + typeNumber + "/errorCorrectionLevel:" + errorCorrectionLevel;
          }
          var length = rsBlock.length / 3;
          var list2 = [];
          for (var i = 0; i < length; i += 1) {
            var count = rsBlock[i * 3 + 0];
            var totalCount = rsBlock[i * 3 + 1];
            var dataCount = rsBlock[i * 3 + 2];
            for (var j = 0; j < count; j += 1) {
              list2.push(qrRSBlock(totalCount, dataCount));
            }
          }
          return list2;
        };
        return _this;
      })();
      var qrBitBuffer = function() {
        var _buffer = [];
        var _length = 0;
        var _this = {};
        _this.getBuffer = function() {
          return _buffer;
        };
        _this.getAt = function(index) {
          var bufIndex = Math.floor(index / 8);
          return (_buffer[bufIndex] >>> 7 - index % 8 & 1) == 1;
        };
        _this.put = function(num, length) {
          for (var i = 0; i < length; i += 1) {
            _this.putBit((num >>> length - i - 1 & 1) == 1);
          }
        };
        _this.getLengthInBits = function() {
          return _length;
        };
        _this.putBit = function(bit) {
          var bufIndex = Math.floor(_length / 8);
          if (_buffer.length <= bufIndex) {
            _buffer.push(0);
          }
          if (bit) {
            _buffer[bufIndex] |= 128 >>> _length % 8;
          }
          _length += 1;
        };
        return _this;
      };
      var qrNumber = function(data) {
        var _mode = QRMode.MODE_NUMBER;
        var _data = data;
        var _this = {};
        _this.getMode = function() {
          return _mode;
        };
        _this.getLength = function(buffer) {
          return _data.length;
        };
        _this.write = function(buffer) {
          var data2 = _data;
          var i = 0;
          while (i + 2 < data2.length) {
            buffer.put(strToNum(data2.substring(i, i + 3)), 10);
            i += 3;
          }
          if (i < data2.length) {
            if (data2.length - i == 1) {
              buffer.put(strToNum(data2.substring(i, i + 1)), 4);
            } else if (data2.length - i == 2) {
              buffer.put(strToNum(data2.substring(i, i + 2)), 7);
            }
          }
        };
        var strToNum = function(s) {
          var num = 0;
          for (var i = 0; i < s.length; i += 1) {
            num = num * 10 + chatToNum(s.charAt(i));
          }
          return num;
        };
        var chatToNum = function(c) {
          if ("0" <= c && c <= "9") {
            return c.charCodeAt(0) - "0".charCodeAt(0);
          }
          throw "illegal char :" + c;
        };
        return _this;
      };
      var qrAlphaNum = function(data) {
        var _mode = QRMode.MODE_ALPHA_NUM;
        var _data = data;
        var _this = {};
        _this.getMode = function() {
          return _mode;
        };
        _this.getLength = function(buffer) {
          return _data.length;
        };
        _this.write = function(buffer) {
          var s = _data;
          var i = 0;
          while (i + 1 < s.length) {
            buffer.put(
              getCode(s.charAt(i)) * 45 + getCode(s.charAt(i + 1)),
              11
            );
            i += 2;
          }
          if (i < s.length) {
            buffer.put(getCode(s.charAt(i)), 6);
          }
        };
        var getCode = function(c) {
          if ("0" <= c && c <= "9") {
            return c.charCodeAt(0) - "0".charCodeAt(0);
          } else if ("A" <= c && c <= "Z") {
            return c.charCodeAt(0) - "A".charCodeAt(0) + 10;
          } else {
            switch (c) {
              case " ":
                return 36;
              case "$":
                return 37;
              case "%":
                return 38;
              case "*":
                return 39;
              case "+":
                return 40;
              case "-":
                return 41;
              case ".":
                return 42;
              case "/":
                return 43;
              case ":":
                return 44;
              default:
                throw "illegal char :" + c;
            }
          }
        };
        return _this;
      };
      var qr8BitByte = function(data) {
        var _mode = QRMode.MODE_8BIT_BYTE;
        var _data = data;
        var _bytes = qrcode3.stringToBytes(data);
        var _this = {};
        _this.getMode = function() {
          return _mode;
        };
        _this.getLength = function(buffer) {
          return _bytes.length;
        };
        _this.write = function(buffer) {
          for (var i = 0; i < _bytes.length; i += 1) {
            buffer.put(_bytes[i], 8);
          }
        };
        return _this;
      };
      var qrKanji = function(data) {
        var _mode = QRMode.MODE_KANJI;
        var _data = data;
        var stringToBytes = qrcode3.stringToBytesFuncs["SJIS"];
        if (!stringToBytes) {
          throw "sjis not supported.";
        }
        !(function(c, code) {
          var test = stringToBytes(c);
          if (test.length != 2 || (test[0] << 8 | test[1]) != code) {
            throw "sjis not supported.";
          }
        })("\u53CB", 38726);
        var _bytes = stringToBytes(data);
        var _this = {};
        _this.getMode = function() {
          return _mode;
        };
        _this.getLength = function(buffer) {
          return ~~(_bytes.length / 2);
        };
        _this.write = function(buffer) {
          var data2 = _bytes;
          var i = 0;
          while (i + 1 < data2.length) {
            var c = (255 & data2[i]) << 8 | 255 & data2[i + 1];
            if (33088 <= c && c <= 40956) {
              c -= 33088;
            } else if (57408 <= c && c <= 60351) {
              c -= 49472;
            } else {
              throw "illegal char at " + (i + 1) + "/" + c;
            }
            c = (c >>> 8 & 255) * 192 + (c & 255);
            buffer.put(c, 13);
            i += 2;
          }
          if (i < data2.length) {
            throw "illegal char at " + (i + 1);
          }
        };
        return _this;
      };
      var byteArrayOutputStream = function() {
        var _bytes = [];
        var _this = {};
        _this.writeByte = function(b) {
          _bytes.push(b & 255);
        };
        _this.writeShort = function(i) {
          _this.writeByte(i);
          _this.writeByte(i >>> 8);
        };
        _this.writeBytes = function(b, off, len) {
          off = off || 0;
          len = len || b.length;
          for (var i = 0; i < len; i += 1) {
            _this.writeByte(b[i + off]);
          }
        };
        _this.writeString = function(s) {
          for (var i = 0; i < s.length; i += 1) {
            _this.writeByte(s.charCodeAt(i));
          }
        };
        _this.toByteArray = function() {
          return _bytes;
        };
        _this.toString = function() {
          var s = "";
          s += "[";
          for (var i = 0; i < _bytes.length; i += 1) {
            if (i > 0) {
              s += ",";
            }
            s += _bytes[i];
          }
          s += "]";
          return s;
        };
        return _this;
      };
      var base64EncodeOutputStream = function() {
        var _buffer = 0;
        var _buflen = 0;
        var _length = 0;
        var _base64 = "";
        var _this = {};
        var writeEncoded = function(b) {
          _base64 += String.fromCharCode(encode(b & 63));
        };
        var encode = function(n) {
          if (n < 0) {
          } else if (n < 26) {
            return 65 + n;
          } else if (n < 52) {
            return 97 + (n - 26);
          } else if (n < 62) {
            return 48 + (n - 52);
          } else if (n == 62) {
            return 43;
          } else if (n == 63) {
            return 47;
          }
          throw "n:" + n;
        };
        _this.writeByte = function(n) {
          _buffer = _buffer << 8 | n & 255;
          _buflen += 8;
          _length += 1;
          while (_buflen >= 6) {
            writeEncoded(_buffer >>> _buflen - 6);
            _buflen -= 6;
          }
        };
        _this.flush = function() {
          if (_buflen > 0) {
            writeEncoded(_buffer << 6 - _buflen);
            _buffer = 0;
            _buflen = 0;
          }
          if (_length % 3 != 0) {
            var padlen = 3 - _length % 3;
            for (var i = 0; i < padlen; i += 1) {
              _base64 += "=";
            }
          }
        };
        _this.toString = function() {
          return _base64;
        };
        return _this;
      };
      var base64DecodeInputStream = function(str) {
        var _str = str;
        var _pos = 0;
        var _buffer = 0;
        var _buflen = 0;
        var _this = {};
        _this.read = function() {
          while (_buflen < 8) {
            if (_pos >= _str.length) {
              if (_buflen == 0) {
                return -1;
              }
              throw "unexpected end of file./" + _buflen;
            }
            var c = _str.charAt(_pos);
            _pos += 1;
            if (c == "=") {
              _buflen = 0;
              return -1;
            } else if (c.match(/^\s$/)) {
              continue;
            }
            _buffer = _buffer << 6 | decode(c.charCodeAt(0));
            _buflen += 6;
          }
          var n = _buffer >>> _buflen - 8 & 255;
          _buflen -= 8;
          return n;
        };
        var decode = function(c) {
          if (65 <= c && c <= 90) {
            return c - 65;
          } else if (97 <= c && c <= 122) {
            return c - 97 + 26;
          } else if (48 <= c && c <= 57) {
            return c - 48 + 52;
          } else if (c == 43) {
            return 62;
          } else if (c == 47) {
            return 63;
          } else {
            throw "c:" + c;
          }
        };
        return _this;
      };
      var gifImage = function(width, height) {
        var _width = width;
        var _height = height;
        var _data = new Array(width * height);
        var _this = {};
        _this.setPixel = function(x, y, pixel) {
          _data[y * _width + x] = pixel;
        };
        _this.write = function(out) {
          out.writeString("GIF87a");
          out.writeShort(_width);
          out.writeShort(_height);
          out.writeByte(128);
          out.writeByte(0);
          out.writeByte(0);
          out.writeByte(0);
          out.writeByte(0);
          out.writeByte(0);
          out.writeByte(255);
          out.writeByte(255);
          out.writeByte(255);
          out.writeString(",");
          out.writeShort(0);
          out.writeShort(0);
          out.writeShort(_width);
          out.writeShort(_height);
          out.writeByte(0);
          var lzwMinCodeSize = 2;
          var raster = getLZWRaster(lzwMinCodeSize);
          out.writeByte(lzwMinCodeSize);
          var offset = 0;
          while (raster.length - offset > 255) {
            out.writeByte(255);
            out.writeBytes(raster, offset, 255);
            offset += 255;
          }
          out.writeByte(raster.length - offset);
          out.writeBytes(raster, offset, raster.length - offset);
          out.writeByte(0);
          out.writeString(";");
        };
        var bitOutputStream = function(out) {
          var _out = out;
          var _bitLength = 0;
          var _bitBuffer = 0;
          var _this2 = {};
          _this2.write = function(data, length) {
            if (data >>> length != 0) {
              throw "length over";
            }
            while (_bitLength + length >= 8) {
              _out.writeByte(255 & (data << _bitLength | _bitBuffer));
              length -= 8 - _bitLength;
              data >>>= 8 - _bitLength;
              _bitBuffer = 0;
              _bitLength = 0;
            }
            _bitBuffer = data << _bitLength | _bitBuffer;
            _bitLength = _bitLength + length;
          };
          _this2.flush = function() {
            if (_bitLength > 0) {
              _out.writeByte(_bitBuffer);
            }
          };
          return _this2;
        };
        var getLZWRaster = function(lzwMinCodeSize) {
          var clearCode = 1 << lzwMinCodeSize;
          var endCode = (1 << lzwMinCodeSize) + 1;
          var bitLength = lzwMinCodeSize + 1;
          var table = lzwTable();
          for (var i = 0; i < clearCode; i += 1) {
            table.add(String.fromCharCode(i));
          }
          table.add(String.fromCharCode(clearCode));
          table.add(String.fromCharCode(endCode));
          var byteOut = byteArrayOutputStream();
          var bitOut = bitOutputStream(byteOut);
          bitOut.write(clearCode, bitLength);
          var dataIndex = 0;
          var s = String.fromCharCode(_data[dataIndex]);
          dataIndex += 1;
          while (dataIndex < _data.length) {
            var c = String.fromCharCode(_data[dataIndex]);
            dataIndex += 1;
            if (table.contains(s + c)) {
              s = s + c;
            } else {
              bitOut.write(table.indexOf(s), bitLength);
              if (table.size() < 4095) {
                if (table.size() == 1 << bitLength) {
                  bitLength += 1;
                }
                table.add(s + c);
              }
              s = c;
            }
          }
          bitOut.write(table.indexOf(s), bitLength);
          bitOut.write(endCode, bitLength);
          bitOut.flush();
          return byteOut.toByteArray();
        };
        var lzwTable = function() {
          var _map = {};
          var _size = 0;
          var _this2 = {};
          _this2.add = function(key) {
            if (_this2.contains(key)) {
              throw "dup key:" + key;
            }
            _map[key] = _size;
            _size += 1;
          };
          _this2.size = function() {
            return _size;
          };
          _this2.indexOf = function(key) {
            return _map[key];
          };
          _this2.contains = function(key) {
            return typeof _map[key] != "undefined";
          };
          return _this2;
        };
        return _this;
      };
      var createDataURL = function(width, height, getPixel) {
        var gif = gifImage(width, height);
        for (var y = 0; y < height; y += 1) {
          for (var x = 0; x < width; x += 1) {
            gif.setPixel(x, y, getPixel(x, y));
          }
        }
        var b = byteArrayOutputStream();
        gif.write(b);
        var base64 = base64EncodeOutputStream();
        var bytes = b.toByteArray();
        for (var i = 0; i < bytes.length; i += 1) {
          base64.writeByte(bytes[i]);
        }
        base64.flush();
        return "data:image/gif;base64," + base64;
      };
      return qrcode3;
    })();
    !(function() {
      qrcode2.stringToBytesFuncs["UTF-8"] = function(s) {
        function toUTF8Array(str) {
          var utf8 = [];
          for (var i = 0; i < str.length; i++) {
            var charcode = str.charCodeAt(i);
            if (charcode < 128) utf8.push(charcode);
            else if (charcode < 2048) {
              utf8.push(
                192 | charcode >> 6,
                128 | charcode & 63
              );
            } else if (charcode < 55296 || charcode >= 57344) {
              utf8.push(
                224 | charcode >> 12,
                128 | charcode >> 6 & 63,
                128 | charcode & 63
              );
            } else {
              i++;
              charcode = 65536 + ((charcode & 1023) << 10 | str.charCodeAt(i) & 1023);
              utf8.push(
                240 | charcode >> 18,
                128 | charcode >> 12 & 63,
                128 | charcode >> 6 & 63,
                128 | charcode & 63
              );
            }
          }
          return utf8;
        }
        return toUTF8Array(s);
      };
    })();
    (function(factory) {
      if (typeof define === "function" && define.amd) {
        define([], factory);
      } else if (typeof exports === "object") {
        module.exports = factory();
      }
    })(function() {
      return qrcode2;
    });
  }
});

// src/services/nostrpair.js
var pairingRelay = freeRelays[0];
var PAIRING_CODE_DOMAIN_TAG = "nostr-pair-sas-v1";
var PUBKEY = /^[0-9a-f]{64}$/;
var SECRET_BYTES = 16;
var CONNECT_TIMEOUT_MS = 3e4;
var REQUEST_TIMEOUT_MS = 12e4;
var EXCHANGE_TIMEOUT_MS = 18e4;
var NETWORK_TIMEOUT_MS = 1e4;
var LOGOUT_TIMEOUT_MS = 1e3;
var PAIRING_CODE_DIGITS = 6;
var PROFILE_NAME_MAX_LENGTH = 128;
var PROFILE_ABOUT_MAX_LENGTH = 4096;
var PROFILE_PICTURE_MAX_LENGTH = 4096;
function isPlainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}
function maybeUnref(timer) {
  timer?.unref?.();
  return timer;
}
function randomHex(bytes) {
  const value = new Uint8Array(bytes);
  crypto.getRandomValues(value);
  return bytesToHex(value);
}
function syncError(error2, { closed = false } = {}) {
  if (closed) return new Error("SYNC_CANCELLED");
  if (error2?.message === "NIP46_REQUEST_TIMEOUT") return new Error("SYNC_TIMEOUT");
  return error2 instanceof Error ? error2 : new Error(String(error2));
}
function waitAtMost(promise, timeout) {
  return new Promise((resolve, reject) => {
    const timer = maybeUnref(setTimeout(() => reject(new Error("SYNC_TIMEOUT")), timeout));
    Promise.resolve(promise).then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error2) => {
        clearTimeout(timer);
        reject(error2);
      }
    );
  });
}
function trustedSignerParams(params) {
  if (!Array.isArray(params) || params.length !== 2) throw new Error("invalid register_trusted_signer params");
  const [platform, signerPubkey] = params;
  if (typeof platform !== "string" || !PUBKEY.test(signerPubkey)) throw new Error("invalid trusted signer");
  return { platform, signerPubkey };
}
function accountExchangeParams(params) {
  if (!Array.isArray(params) || params.length !== 3) throw new Error("invalid exchange_accounts params");
  const [code, platform, accountsJson] = params;
  if (typeof code !== "string" || typeof platform !== "string" || typeof accountsJson !== "string") {
    throw new Error("invalid exchange_accounts params");
  }
  let accounts;
  try {
    accounts = JSON.parse(accountsJson);
  } catch {
    throw new Error("invalid accounts");
  }
  if (!Array.isArray(accounts)) throw new Error("invalid accounts");
  return { code, platform, accounts };
}
async function derivePairingCode(seckey, peerPubkey) {
  const conversationKey = getConversationKey(seckey, peerPubkey);
  const hmacKey = await crypto.subtle.importKey(
    "raw",
    conversationKey,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const tagBytes = new TextEncoder().encode(PAIRING_CODE_DOMAIN_TAG);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", hmacKey, tagBytes));
  const n = mac[0] * 16777216 + (mac[1] << 16) + (mac[2] << 8) + mac[3];
  return String(n % 10 ** PAIRING_CODE_DIGITS).padStart(PAIRING_CODE_DIGITS, "0");
}
var HostSession = class {
  #ephSecretKey;
  #ephPubkey;
  #secret;
  #relay;
  #rpc;
  #handlers;
  #requestTimeout;
  #subscriptionTimeout;
  #closed = false;
  constructor({
    onJoinerConnected,
    onPairingCode,
    onError,
    onTrustedSignerReceived,
    onExchangeRequest,
    _relayPool = relayPool,
    _requestTimeout = REQUEST_TIMEOUT_MS,
    _subscriptionTimeout = NETWORK_TIMEOUT_MS
  } = {}) {
    this.#ephSecretKey = generateSecretKey();
    this.#ephPubkey = getPublicKey(this.#ephSecretKey);
    this.#secret = randomHex(SECRET_BYTES);
    this.#relay = pairingRelay;
    this.#handlers = { onJoinerConnected, onPairingCode, onError, onTrustedSignerReceived, onExchangeRequest };
    this.#requestTimeout = _requestTimeout;
    this.#subscriptionTimeout = _subscriptionTimeout;
    this.#rpc = new Nip46ServerSession(this.#ephSecretKey, {
      relays: [this.#relay],
      secret: this.#secret,
      relayPool: _relayPool,
      timeout: NETWORK_TIMEOUT_MS,
      onError,
      onConnect: ({ peerPubkey }) => this.#onConnect(peerPubkey),
      onRequest: (request) => this.#onRequest(request)
    });
  }
  get url() {
    return buildNostrpairUrl({ pubkey: this.#ephPubkey, relay: this.#relay, secret: this.#secret });
  }
  async start() {
    if (this.#closed) return;
    try {
      await this.#rpc.start({ timeout: this.#subscriptionTimeout });
    } catch (error2) {
      if (!this.#closed) throw error2;
    }
  }
  cancel() {
    this.close();
  }
  close() {
    if (this.#closed) return;
    this.#closed = true;
    this.#rpc.close().catch((error2) => this.#handlers.onError?.(error2));
  }
  async #onConnect(peerPubkey) {
    if (this.#closed) throw new Error("SYNC_CANCELLED");
    this.#handlers.onJoinerConnected?.();
    const code = await derivePairingCode(this.#ephSecretKey, peerPubkey);
    this.#handlers.onPairingCode?.(code);
  }
  async #onRequest({ method, params }) {
    if (this.#closed) throw new Error("SYNC_CANCELLED");
    if (method === "register_trusted_signer") {
      const incoming = trustedSignerParams(params);
      const ourTrust = await this.#handlers.onTrustedSignerReceived?.(incoming);
      if (ourTrust?.signerPubkey) {
        if (!PUBKEY.test(ourTrust.signerPubkey)) throw new Error("invalid local trusted signer");
        const result = await this.#rpc.sendRequest("register_trusted_signer", [
          typeof ourTrust.platform === "string" ? ourTrust.platform : "",
          ourTrust.signerPubkey
        ], { timeout: this.#requestTimeout });
        if (result !== "ack") throw new Error("REGISTER_TRUSTED_SIGNER_FAILED");
      }
      return "ack";
    }
    if (method === "exchange_accounts") {
      const incoming = accountExchangeParams(params);
      const code = await derivePairingCode(this.#ephSecretKey, this.#rpc.clientPubkey);
      if (incoming.code !== code) throw new Error("invalid pairing code");
      const outgoing = await this.#handlers.onExchangeRequest?.({
        platform: incoming.platform,
        accounts: incoming.accounts
      });
      return JSON.stringify({
        platform: typeof outgoing?.platform === "string" ? outgoing.platform : "",
        accounts: Array.isArray(outgoing?.accounts) ? outgoing.accounts : []
      });
    }
    throw new Error("method not supported on nostrpair channel");
  }
};
var JoinerSession = class {
  #ephSecretKey;
  #remotePubkey;
  #client;
  #handlers;
  #connectTimeout;
  #requestTimeout;
  #exchangeTimeout;
  #closed = false;
  #peerSignerReceived = null;
  #peerSignerResolve = null;
  #peerSignerReject = null;
  #peerSignerTimer = null;
  constructor(url, {
    onPairingCode,
    onConnected,
    onError,
    _relayPool = relayPool,
    _connectTimeout = CONNECT_TIMEOUT_MS,
    _requestTimeout = REQUEST_TIMEOUT_MS,
    _exchangeTimeout = EXCHANGE_TIMEOUT_MS
  } = {}) {
    const parsed = parseNostrpairInput(url);
    this.#remotePubkey = parsed.pubkey;
    this.#ephSecretKey = generateSecretKey();
    this.#handlers = { onPairingCode, onConnected, onError };
    this.#connectTimeout = _connectTimeout;
    this.#requestTimeout = _requestTimeout;
    this.#exchangeTimeout = _exchangeTimeout;
    this.#client = new Nip46Client(this.#ephSecretKey, {
      remoteSignerPubkey: parsed.pubkey,
      relays: [parsed.relay],
      secret: parsed.secret
    }, {
      relayPool: _relayPool,
      timeout: NETWORK_TIMEOUT_MS,
      onError,
      onRequest: (request) => this.#onRequest(request)
    });
  }
  async connect() {
    try {
      await this.#client.connect({ timeout: this.#connectTimeout });
      if (this.#closed) throw new Error("SYNC_CANCELLED");
      this.#handlers.onConnected?.();
      const code = await derivePairingCode(this.#ephSecretKey, this.#remotePubkey);
      this.#handlers.onPairingCode?.(code);
    } catch (error2) {
      throw syncError(error2, { closed: this.#closed });
    }
  }
  async exchangeTrust({ platform = "", signerPubkey } = {}) {
    if (!PUBKEY.test(signerPubkey)) throw new Error("INVALID_TRUSTED_SIGNER");
    const peerPromise = this.#awaitPeerTrustedSigner({ timeout: this.#requestTimeout });
    try {
      const acknowledgement = this.#client.sendRequest("register_trusted_signer", [platform, signerPubkey], { timeout: this.#requestTimeout }).then((result) => {
        if (result !== "ack") throw new Error("REGISTER_TRUSTED_SIGNER_FAILED");
      });
      const [, peer] = await Promise.all([acknowledgement, peerPromise]);
      return peer;
    } catch (error2) {
      clearTimeout(this.#peerSignerTimer);
      this.#peerSignerTimer = null;
      this.#peerSignerResolve = null;
      this.#peerSignerReject = null;
      throw syncError(error2, { closed: this.#closed });
    }
  }
  async exchangeAccounts({ code = "", platform = "", accounts = [] } = {}) {
    let resultJson;
    try {
      resultJson = await this.#client.sendRequest("exchange_accounts", [
        code,
        platform,
        JSON.stringify(Array.isArray(accounts) ? accounts : [])
      ], { timeout: this.#exchangeTimeout });
    } catch (error2) {
      throw syncError(error2, { closed: this.#closed });
    }
    let result;
    try {
      result = JSON.parse(resultJson);
    } catch {
      throw new Error("SYNC_BAD_RESPONSE");
    }
    if (!isPlainObject(result) || !Array.isArray(result.accounts)) throw new Error("SYNC_BAD_RESPONSE");
    try {
      await waitAtMost(this.#client.logout(), LOGOUT_TIMEOUT_MS);
    } catch {
    }
    await this.#client.close();
    this.#closed = true;
    return {
      platform: typeof result.platform === "string" ? result.platform : "",
      accounts: result.accounts
    };
  }
  close() {
    if (this.#closed) return;
    this.#closed = true;
    this.#client.close().catch((error2) => this.#handlers.onError?.(error2));
    clearTimeout(this.#peerSignerTimer);
    this.#peerSignerTimer = null;
    this.#peerSignerReject?.(new Error("SYNC_CANCELLED"));
    this.#peerSignerResolve = null;
    this.#peerSignerReject = null;
  }
  #awaitPeerTrustedSigner({ timeout }) {
    if (this.#peerSignerReceived) return Promise.resolve(this.#peerSignerReceived);
    return new Promise((resolve, reject) => {
      this.#peerSignerTimer = maybeUnref(setTimeout(() => {
        this.#peerSignerResolve = null;
        this.#peerSignerReject = null;
        this.#peerSignerTimer = null;
        reject(new Error("SYNC_TIMEOUT"));
      }, timeout));
      this.#peerSignerResolve = (value) => {
        clearTimeout(this.#peerSignerTimer);
        this.#peerSignerTimer = null;
        resolve(value);
      };
      this.#peerSignerReject = (error2) => {
        clearTimeout(this.#peerSignerTimer);
        this.#peerSignerTimer = null;
        reject(error2);
      };
    });
  }
  async #onRequest({ method, params }) {
    if (method !== "register_trusted_signer") throw new Error("method not supported on nostrpair channel");
    const peer = trustedSignerParams(params);
    this.#peerSignerReceived = peer;
    this.#peerSignerResolve?.(peer);
    this.#peerSignerResolve = null;
    this.#peerSignerReject = null;
    return "ack";
  }
};
function buildSyncAccountEntries(accounts, secretEntries, { nsecFromHex: nsecFromHex2, npubFromPubkey: npubFromPubkey2 }) {
  const nsecByPubkey = /* @__PURE__ */ new Map();
  const clientKeyByPubkey = /* @__PURE__ */ new Map();
  for (const entry of secretEntries) {
    if (entry.type === "nsec") nsecByPubkey.set(entry.pubkey, entry.seckey);
    else if (entry.type === "bunker") clientKeyByPubkey.set(entry.pubkey, entry.clientKey);
  }
  const out = [];
  for (const account of accounts) {
    if (account.type === "nsec") {
      const seckey = nsecByPubkey.get(account.pubkey);
      if (!seckey) continue;
      out.push({
        type: "nsec",
        value: nsecFromHex2(seckey),
        pubkey: account.pubkey,
        profile: profileForAccount(account)
      });
    } else if (account.type === "npub") {
      out.push({
        type: "npub",
        value: npubFromPubkey2(account.pubkey),
        pubkey: account.pubkey,
        profile: profileForAccount(account)
      });
    } else if (account.type === "bunker") {
      const clientKey = clientKeyByPubkey.get(account.pubkey);
      if (!clientKey) continue;
      out.push({
        type: "bunker",
        value: buildBunkerUrlWithClientKey(account.bunker, clientKey),
        pubkey: account.pubkey,
        profile: profileForAccount(account)
      });
    }
  }
  return out;
}
function profileContent(event) {
  if (!event?.content) return {};
  try {
    const parsed = JSON.parse(event.content);
    return isPlainObject(parsed) ? parsed : {};
  } catch {
    return {};
  }
}
function cleanProfileField(value, maxLength) {
  const clean = typeof value === "string" ? value.trim() : "";
  return clean.length <= maxLength ? clean : "";
}
function profileForAccount(account) {
  const profile = {};
  const content = profileContent(account.profileEvent);
  const name = cleanProfileField(account.name, PROFILE_NAME_MAX_LENGTH);
  const picture = cleanProfileField(account.picture, PROFILE_PICTURE_MAX_LENGTH);
  const contentName = cleanProfileField(content.name, PROFILE_NAME_MAX_LENGTH);
  const contentPicture = cleanProfileField(content.picture, PROFILE_PICTURE_MAX_LENGTH);
  const about = cleanProfileField(content.about, PROFILE_ABOUT_MAX_LENGTH);
  if (name || contentName) profile.name = name || contentName;
  if (about) profile.about = about;
  if (picture || contentPicture) profile.picture = picture || contentPicture;
  return profile;
}
function buildSyncAccountPayload(accounts, secretEntries, converters) {
  return {
    accounts: buildSyncAccountEntries(accounts, secretEntries, converters)
  };
}

// src/helpers/qrcode.js
var import_qrcode_generator = __toESM(require_qrcode(), 1);
function generateQrDataUrl(text, { errorCorrection = "M", cellSize = 6, margin = 4 } = {}) {
  const qr = (0, import_qrcode_generator.default)(0, errorCorrection);
  qr.addData(text);
  qr.make();
  return qr.createDataURL(cellSize, margin);
}

// src/components/sync/sync-host.js
var ICON_X = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6l-12 12" /><path d="M6 6l12 12" /></svg>';
var ICON_COPY = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 9.667a2.667 2.667 0 0 1 2.667 -2.667h8.666a2.667 2.667 0 0 1 2.667 2.667v8.666a2.667 2.667 0 0 1 -2.667 2.667h-8.666a2.667 2.667 0 0 1 -2.667 -2.667l0 -8.666" /><path d="M4.012 16.737a2.005 2.005 0 0 1 -1.012 -1.737v-10c0 -1.1 .9 -2 2 -2h10c.75 0 1.158 .385 1.5 1" /></svg>';
var ICON_CHECK = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5l10 -10" /></svg>';
var FLASH_MS = 1500;
var CLOSE_RESET_MS = 300;
var syncHostLocales = defineLocales({
  Cancel: ["Annuler", "Annulla", "Abbrechen", "Cancelar", "Cancelar", "\u041E\u0442\u043C\u0435\u043D\u0430", "\u53D6\u6D88", "\u53D6\u6D88", "\u30AD\u30E3\u30F3\u30BB\u30EB", "\uCDE8\uC18C"],
  "Scan the QR code or paste the URL on the other device": ["Scannez le code QR ou collez l\u2019URL sur l\u2019autre appareil", "Scansiona il codice QR o incolla l\u2019URL sull\u2019altro dispositivo", "QR-Code scannen oder URL auf dem anderen Ger\xE4t einf\xFCgen", "Escanea el c\xF3digo QR o pega la URL en el otro dispositivo", "Leia o QR code ou cole a URL no outro dispositivo", "\u041E\u0442\u0441\u043A\u0430\u043D\u0438\u0440\u0443\u0439\u0442\u0435 QR-\u043A\u043E\u0434 \u0438\u043B\u0438 \u0432\u0441\u0442\u0430\u0432\u044C\u0442\u0435 URL \u043D\u0430 \u0434\u0440\u0443\u0433\u043E\u043C \u0443\u0441\u0442\u0440\u043E\u0439\u0441\u0442\u0432\u0435", "\u5728\u53E6\u4E00\u53F0\u8BBE\u5907\u4E0A\u626B\u63CF\u4E8C\u7EF4\u7801\u6216\u7C98\u8D34 URL", "\u5728\u53E6\u4E00\u53F0\u88DD\u7F6E\u4E0A\u6383\u63CF QR \u78BC\u6216\u8CBC\u4E0A URL", "\u5225\u306E\u30C7\u30D0\u30A4\u30B9\u3067 QR \u30B3\u30FC\u30C9\u3092\u30B9\u30AD\u30E3\u30F3\u3059\u308B\u304B URL \u3092\u8CBC\u308A\u4ED8\u3051\u3066\u304F\u3060\u3055\u3044", "\uB2E4\uB978 \uAE30\uAE30\uC5D0\uC11C QR \uCF54\uB4DC\uB97C \uC2A4\uCE94\uD558\uAC70\uB098 URL\uC744 \uBD99\uC5EC \uB123\uC73C\uC138\uC694"],
  "Copy URL": ["Copier l\u2019URL", "Copia URL", "URL kopieren", "Copiar URL", "Copiar URL", "\u041A\u043E\u043F\u0438\u0440\u043E\u0432\u0430\u0442\u044C URL", "\u590D\u5236 URL", "\u8907\u88FD URL", "URL \u3092\u30B3\u30D4\u30FC", "URL \uBCF5\uC0AC"],
  "Type this code on the other device:": ["Saisissez ce code sur l\u2019autre appareil :", "Digita questo codice sull\u2019altro dispositivo:", "Diesen Code auf dem anderen Ger\xE4t eingeben:", "Escribe este c\xF3digo en el otro dispositivo:", "Digite este c\xF3digo no outro dispositivo:", "\u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u044D\u0442\u043E\u0442 \u043A\u043E\u0434 \u043D\u0430 \u0434\u0440\u0443\u0433\u043E\u043C \u0443\u0441\u0442\u0440\u043E\u0439\u0441\u0442\u0432\u0435:", "\u5728\u53E6\u4E00\u53F0\u8BBE\u5907\u4E0A\u8F93\u5165\u6B64\u4EE3\u7801\uFF1A", "\u5728\u53E6\u4E00\u53F0\u88DD\u7F6E\u4E0A\u8F38\u5165\u6B64\u4EE3\u78BC\uFF1A", "\u5225\u306E\u30C7\u30D0\u30A4\u30B9\u3067\u3053\u306E\u30B3\u30FC\u30C9\u3092\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044\uFF1A", "\uB2E4\uB978 \uAE30\uAE30\uC5D0 \uC774 \uCF54\uB4DC\uB97C \uC785\uB825\uD558\uC138\uC694:"],
  "Copy code": ["Copier le code", "Copia codice", "Code kopieren", "Copiar c\xF3digo", "Copiar c\xF3digo", "\u041A\u043E\u043F\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u043A\u043E\u0434", "\u590D\u5236\u4EE3\u7801", "\u8907\u88FD\u4EE3\u78BC", "\u30B3\u30FC\u30C9\u3092\u30B3\u30D4\u30FC", "\uCF54\uB4DC \uBCF5\uC0AC"],
  "Other device connected: exchanging trust\u2026": ["Autre appareil connect\xE9 : \xE9change de confiance\u2026", "Altro dispositivo connesso: scambio di fiducia\u2026", "Anderes Ger\xE4t verbunden: Vertrauen wird ausgetauscht\u2026", "Otro dispositivo conectado: intercambiando confianza\u2026", "Outro dispositivo conectado: trocando confian\xE7a\u2026", "\u0414\u0440\u0443\u0433\u043E\u0435 \u0443\u0441\u0442\u0440\u043E\u0439\u0441\u0442\u0432\u043E \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u043E: \u043E\u0431\u043C\u0435\u043D \u0434\u043E\u0432\u0435\u0440\u0438\u0435\u043C\u2026", "\u53E6\u4E00\u53F0\u8BBE\u5907\u5DF2\u8FDE\u63A5\uFF1A\u6B63\u5728\u4EA4\u6362\u4FE1\u4EFB\u4FE1\u606F\u2026", "\u53E6\u4E00\u53F0\u88DD\u7F6E\u5DF2\u9023\u7DDA\uFF1A\u6B63\u5728\u4EA4\u63DB\u4FE1\u4EFB\u8CC7\u8A0A\u2026", "\u5225\u306E\u30C7\u30D0\u30A4\u30B9\u304C\u63A5\u7D9A\u3055\u308C\u307E\u3057\u305F\uFF1A\u4FE1\u983C\u60C5\u5831\u3092\u4EA4\u63DB\u4E2D\u2026", "\uB2E4\uB978 \uAE30\uAE30\uAC00 \uC5F0\uACB0\uB428: \uC2E0\uB8B0 \uC815\uBCF4 \uAD50\uD658 \uC911\u2026"],
  "Waiting: type the code above on the other device.": ["En attente : saisissez le code ci-dessus sur l\u2019autre appareil.", "In attesa: digita il codice qui sopra sull\u2019altro dispositivo.", "Warten: Den obigen Code auf dem anderen Ger\xE4t eingeben.", "Esperando: escribe el c\xF3digo anterior en el otro dispositivo.", "Aguardando: digite o c\xF3digo acima no outro dispositivo.", "\u041E\u0436\u0438\u0434\u0430\u043D\u0438\u0435: \u0432\u0432\u0435\u0434\u0438\u0442\u0435 \u0443\u043A\u0430\u0437\u0430\u043D\u043D\u044B\u0439 \u0432\u044B\u0448\u0435 \u043A\u043E\u0434 \u043D\u0430 \u0434\u0440\u0443\u0433\u043E\u043C \u0443\u0441\u0442\u0440\u043E\u0439\u0441\u0442\u0432\u0435.", "\u7B49\u5F85\u4E2D\uFF1A\u8BF7\u5728\u53E6\u4E00\u53F0\u8BBE\u5907\u4E0A\u8F93\u5165\u4E0A\u65B9\u4EE3\u7801\u3002", "\u7B49\u5F85\u4E2D\uFF1A\u8ACB\u5728\u53E6\u4E00\u53F0\u88DD\u7F6E\u4E0A\u8F38\u5165\u4E0A\u65B9\u4EE3\u78BC\u3002", "\u5F85\u6A5F\u4E2D\uFF1A\u5225\u306E\u30C7\u30D0\u30A4\u30B9\u3067\u4E0A\u306E\u30B3\u30FC\u30C9\u3092\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044\u3002", "\uB300\uAE30 \uC911: \uB2E4\uB978 \uAE30\uAE30\uC5D0 \uC704 \uCF54\uB4DC\uB97C \uC785\uB825\uD558\uC138\uC694."],
  "Pairing channel error: try again.": ["Erreur du canal d\u2019association : r\xE9essayez.", "Errore del canale di associazione: riprova.", "Fehler im Kopplungskanal: Erneut versuchen.", "Error del canal de emparejamiento: int\xE9ntalo de nuevo.", "Erro no canal de pareamento: tente novamente.", "\u041E\u0448\u0438\u0431\u043A\u0430 \u043A\u0430\u043D\u0430\u043B\u0430 \u0441\u043E\u043F\u0440\u044F\u0436\u0435\u043D\u0438\u044F: \u043F\u043E\u043F\u0440\u043E\u0431\u0443\u0439\u0442\u0435 \u0435\u0449\u0451 \u0440\u0430\u0437.", "\u914D\u5BF9\u901A\u9053\u51FA\u9519\uFF1A\u8BF7\u91CD\u8BD5\u3002", "\u914D\u5C0D\u901A\u9053\u932F\u8AA4\uFF1A\u8ACB\u91CD\u8A66\u3002", "\u30DA\u30A2\u30EA\u30F3\u30B0\u30C1\u30E3\u30CD\u30EB\u30A8\u30E9\u30FC\uFF1A\u3082\u3046\u4E00\u5EA6\u304A\u8A66\u3057\u304F\u3060\u3055\u3044\u3002", "\uD398\uC5B4\uB9C1 \uCC44\uB110 \uC624\uB958: \uB2E4\uC2DC \uC2DC\uB3C4\uD558\uC138\uC694."],
  "Waiting for the other device to scan or paste the URL.": ["En attente du scan ou du collage de l\u2019URL par l\u2019autre appareil.", "In attesa che l\u2019altro dispositivo scansioni o incolli l\u2019URL.", "Warten, bis das andere Ger\xE4t die URL scannt oder einf\xFCgt.", "Esperando a que el otro dispositivo escanee o pegue la URL.", "Aguardando o outro dispositivo ler ou colar a URL.", "\u041E\u0436\u0438\u0434\u0430\u043D\u0438\u0435 \u0441\u043A\u0430\u043D\u0438\u0440\u043E\u0432\u0430\u043D\u0438\u044F \u0438\u043B\u0438 \u0432\u0441\u0442\u0430\u0432\u043A\u0438 URL \u043D\u0430 \u0434\u0440\u0443\u0433\u043E\u043C \u0443\u0441\u0442\u0440\u043E\u0439\u0441\u0442\u0432\u0435.", "\u6B63\u5728\u7B49\u5F85\u53E6\u4E00\u53F0\u8BBE\u5907\u626B\u63CF\u6216\u7C98\u8D34 URL\u3002", "\u6B63\u5728\u7B49\u5F85\u53E6\u4E00\u53F0\u88DD\u7F6E\u6383\u63CF\u6216\u8CBC\u4E0A URL\u3002", "\u5225\u306E\u30C7\u30D0\u30A4\u30B9\u304C URL \u3092\u30B9\u30AD\u30E3\u30F3\u307E\u305F\u306F\u8CBC\u308A\u4ED8\u3051\u308B\u306E\u3092\u5F85\u3063\u3066\u3044\u307E\u3059\u3002", "\uB2E4\uB978 \uAE30\uAE30\uC5D0\uC11C URL\uC744 \uC2A4\uCE94\uD558\uAC70\uB098 \uBD99\uC5EC \uB123\uAE30\uB97C \uAE30\uB2E4\uB9AC\uB294 \uC911\uC785\uB2C8\uB2E4."],
  "Importing accounts from the other device\u2026": ["Importation des comptes de l\u2019autre appareil\u2026", "Importazione degli account dall\u2019altro dispositivo\u2026", "Konten vom anderen Ger\xE4t werden importiert\u2026", "Importando cuentas del otro dispositivo\u2026", "Importando contas do outro dispositivo\u2026", "\u0418\u043C\u043F\u043E\u0440\u0442 \u0443\u0447\u0451\u0442\u043D\u044B\u0445 \u0437\u0430\u043F\u0438\u0441\u0435\u0439 \u0441 \u0434\u0440\u0443\u0433\u043E\u0433\u043E \u0443\u0441\u0442\u0440\u043E\u0439\u0441\u0442\u0432\u0430\u2026", "\u6B63\u5728\u4ECE\u53E6\u4E00\u53F0\u8BBE\u5907\u5BFC\u5165\u8D26\u6237\u2026", "\u6B63\u5728\u5F9E\u53E6\u4E00\u53F0\u88DD\u7F6E\u532F\u5165\u5E33\u6236\u2026", "\u5225\u306E\u30C7\u30D0\u30A4\u30B9\u304B\u3089\u30A2\u30AB\u30A6\u30F3\u30C8\u3092\u30A4\u30F3\u30DD\u30FC\u30C8\u4E2D\u2026", "\uB2E4\uB978 \uAE30\uAE30\uC5D0\uC11C \uACC4\uC815 \uAC00\uC838\uC624\uB294 \uC911\u2026"],
  "Devices synced": ["Appareils synchronis\xE9s", "Dispositivi sincronizzati", "Ger\xE4te synchronisiert", "Dispositivos sincronizados", "Dispositivos sincronizados", "\u0423\u0441\u0442\u0440\u043E\u0439\u0441\u0442\u0432\u0430 \u0441\u0438\u043D\u0445\u0440\u043E\u043D\u0438\u0437\u0438\u0440\u043E\u0432\u0430\u043D\u044B", "\u8BBE\u5907\u5DF2\u540C\u6B65", "\u88DD\u7F6E\u5DF2\u540C\u6B65", "\u30C7\u30D0\u30A4\u30B9\u3092\u540C\u671F\u3057\u307E\u3057\u305F", "\uAE30\uAE30 \uB3D9\uAE30\uD654 \uC644\uB8CC"],
  "Synced: imported {{count}} accounts": ["Synchronisation termin\xE9e : {{count}} comptes import\xE9s", "Sincronizzazione completata: importati {{count}} account", "Synchronisiert: {{count}} Konten importiert", "Sincronizado: se importaron {{count}} cuentas", "Sincronizado: {{count}} contas importadas", "\u0421\u0438\u043D\u0445\u0440\u043E\u043D\u0438\u0437\u0430\u0446\u0438\u044F \u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u0430: \u0438\u043C\u043F\u043E\u0440\u0442\u0438\u0440\u043E\u0432\u0430\u043D\u043E \u0443\u0447\u0451\u0442\u043D\u044B\u0445 \u0437\u0430\u043F\u0438\u0441\u0435\u0439 \u2014 {{count}}", "\u540C\u6B65\u5B8C\u6210\uFF1A\u5DF2\u5BFC\u5165 {{count}} \u4E2A\u8D26\u6237", "\u540C\u6B65\u5B8C\u6210\uFF1A\u5DF2\u532F\u5165 {{count}} \u500B\u5E33\u6236", "\u540C\u671F\u5B8C\u4E86\uFF1A{{count}} \u4EF6\u306E\u30A2\u30AB\u30A6\u30F3\u30C8\u3092\u30A4\u30F3\u30DD\u30FC\u30C8\u3057\u307E\u3057\u305F", "\uB3D9\uAE30\uD654 \uC644\uB8CC: \uACC4\uC815 {{count}}\uAC1C\uB97C \uAC00\uC838\uC654\uC2B5\uB2C8\uB2E4"],
  "{{summary}} ({{count}} failed)": ["{{summary}} ({{count}} \xE9checs)", "{{summary}} ({{count}} non riusciti)", "{{summary}} ({{count}} fehlgeschlagen)", "{{summary}} ({{count}} fallidos)", "{{summary}} ({{count}} falharam)", "{{summary}} (\u043E\u0448\u0438\u0431\u043E\u043A: {{count}})", "{{summary}}\uFF08{{count}} \u4E2A\u5931\u8D25\uFF09", "{{summary}}\uFF08{{count}} \u500B\u5931\u6557\uFF09", "{{summary}}\uFF08{{count}} \u4EF6\u5931\u6557\uFF09", "{{summary}} ({{count}}\uAC1C \uC2E4\uD328)"],
  "Done.": ["Termin\xE9.", "Fatto.", "Fertig.", "Listo.", "Conclu\xEDdo.", "\u0413\u043E\u0442\u043E\u0432\u043E.", "\u5B8C\u6210\u3002", "\u5B8C\u6210\u3002", "\u5B8C\u4E86\u3057\u307E\u3057\u305F\u3002", "\uC644\uB8CC."],
  "Sync failed": ["\xC9chec de la synchronisation", "Sincronizzazione non riuscita", "Synchronisierung fehlgeschlagen", "Error de sincronizaci\xF3n", "Falha na sincroniza\xE7\xE3o", "\u041E\u0448\u0438\u0431\u043A\u0430 \u0441\u0438\u043D\u0445\u0440\u043E\u043D\u0438\u0437\u0430\u0446\u0438\u0438", "\u540C\u6B65\u5931\u8D25", "\u540C\u6B65\u5931\u6557", "\u540C\u671F\u306B\u5931\u6557\u3057\u307E\u3057\u305F", "\uB3D9\uAE30\uD654 \uC2E4\uD328"],
  "Sync cancelled": ["Synchronisation annul\xE9e", "Sincronizzazione annullata", "Synchronisierung abgebrochen", "Sincronizaci\xF3n cancelada", "Sincroniza\xE7\xE3o cancelada", "\u0421\u0438\u043D\u0445\u0440\u043E\u043D\u0438\u0437\u0430\u0446\u0438\u044F \u043E\u0442\u043C\u0435\u043D\u0435\u043D\u0430", "\u540C\u6B65\u5DF2\u53D6\u6D88", "\u540C\u6B65\u5DF2\u53D6\u6D88", "\u540C\u671F\u3092\u30AD\u30E3\u30F3\u30BB\u30EB\u3057\u307E\u3057\u305F", "\uB3D9\uAE30\uD654 \uCDE8\uC18C\uB428"],
  "Pairing cancelled": ["Association annul\xE9e", "Associazione annullata", "Kopplung abgebrochen", "Emparejamiento cancelado", "Pareamento cancelado", "\u0421\u043E\u043F\u0440\u044F\u0436\u0435\u043D\u0438\u0435 \u043E\u0442\u043C\u0435\u043D\u0435\u043D\u043E", "\u914D\u5BF9\u5DF2\u53D6\u6D88", "\u914D\u5C0D\u5DF2\u53D6\u6D88", "\u30DA\u30A2\u30EA\u30F3\u30B0\u3092\u30AD\u30E3\u30F3\u30BB\u30EB\u3057\u307E\u3057\u305F", "\uD398\uC5B4\uB9C1 \uCDE8\uC18C\uB428"],
  "The passkey prompt was cancelled.": ["L\u2019invite de cl\xE9 d\u2019acc\xE8s a \xE9t\xE9 annul\xE9e.", "La richiesta della passkey \xE8 stata annullata.", "Die Passkey-Abfrage wurde abgebrochen.", "Se cancel\xF3 la solicitud de passkey.", "A solicita\xE7\xE3o de passkey foi cancelada.", "\u0417\u0430\u043F\u0440\u043E\u0441 \u043A\u043B\u044E\u0447\u0430 \u0434\u043E\u0441\u0442\u0443\u043F\u0430 \u043E\u0442\u043C\u0435\u043D\u0451\u043D.", "\u901A\u884C\u5BC6\u94A5\u63D0\u793A\u5DF2\u53D6\u6D88\u3002", "\u901A\u884C\u91D1\u9470\u63D0\u793A\u5DF2\u53D6\u6D88\u3002", "\u30D1\u30B9\u30AD\u30FC\u306E\u78BA\u8A8D\u304C\u30AD\u30E3\u30F3\u30BB\u30EB\u3055\u308C\u307E\u3057\u305F\u3002", "\uD328\uC2A4\uD0A4 \uC694\uCCAD\uC774 \uCDE8\uC18C\uB418\uC5C8\uC2B5\uB2C8\uB2E4."],
  "Pairing failed": ["\xC9chec de l\u2019association", "Associazione non riuscita", "Kopplung fehlgeschlagen", "Error de emparejamiento", "Falha no pareamento", "\u041E\u0448\u0438\u0431\u043A\u0430 \u0441\u043E\u043F\u0440\u044F\u0436\u0435\u043D\u0438\u044F", "\u914D\u5BF9\u5931\u8D25", "\u914D\u5C0D\u5931\u6557", "\u30DA\u30A2\u30EA\u30F3\u30B0\u306B\u5931\u6557\u3057\u307E\u3057\u305F", "\uD398\uC5B4\uB9C1 \uC2E4\uD328"]
});
var t = getT(syncHostLocales);
var STYLES = (
  /* css */
  `
  sync-host {
    display: block;
    overflow: hidden;
    max-height: 0;
    transition: max-height 280ms ease-out;
  }
  sync-host[open] {
    max-height: 540px;
  }
  sync-host .host-panel {
    padding-top: 12px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  sync-host .host-header {
    display: flex;
    align-items: center;
    gap: 5px;
  }
  sync-host .host-title {
    font-size: 13rem;
    font-weight: 600;
    color: var(--fg-strong);
  }
  sync-host .host-cancel {
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background-color: var(--surface-interactive);
    color: var(--fg-strong);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  sync-host .host-cancel:active {
    background-color: var(--surface-interactive-active);
  }
  sync-host .host-cancel svg {
    width: 12px;
    height: 12px;
  }
  sync-host .host-qr-wrap {
    align-self: center;
    padding: 8px;
    background-color: var(--surface-inverse);
    border-radius: 8px;
  }
  sync-host .host-qr {
    display: block;
    width: 200px;
    height: 200px;
    image-rendering: pixelated;
  }
  sync-host .host-url-row {
    position: relative;
  }
  sync-host .host-url {
    width: 100%;
    padding-right: 42px;
    background-color: var(--surface-interactive);
    font-size: 12rem;
  }
  sync-host .host-copy {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    right: 5px;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background-color: transparent;
    color: var(--fg-strong);
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  sync-host .host-copy:active {
    background-color: var(--surface-interactive-active);
  }
  sync-host .host-copy.is-success {
    color: var(--success-fg);
  }
  sync-host .host-copy svg {
    width: 16px;
    height: 16px;
  }
  sync-host .host-panel-gap-reset {
    display: flex;
    flex-direction: column;
  }
  /* Pair code section: collapsed until we have the joiner's pubkey and can
     derive the code. The transition mirrors the host's max-height animation
     so the reveal is one smooth motion. */
  sync-host .host-code-section {
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-height: 0;
    opacity: 0;
    overflow: hidden;
    transition: max-height 280ms ease-out, opacity 200ms ease-out;
  }
  sync-host[data-code-ready="true"] .host-code-section {
    max-height: 80px;
    opacity: 1;
    margin-bottom: 10px;
  }
  sync-host .host-code-label {
    font-size: 14rem;
    font-weight: 600;
    color: var(--fg);
  }
  /* 3-column grid centers the digits even though the copy button only sits
     on the right (column 1 mirrors column 3's button width). */
  sync-host .host-code {
    display: grid;
    grid-template-columns: 32px 1fr 32px;
    align-items: center;
    background-color: var(--surface-interactive);
    color: var(--fg-strong);
    padding: 8px;
    border-radius: 6px;
  }
  sync-host .host-code-text {
    grid-column: 2;
    text-align: center;
    letter-spacing: 0.4em;
    font-size: 28rem;
    font-variant-numeric: tabular-nums;
  }
  sync-host .host-code-copy {
    grid-column: 3;
    justify-self: end;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background-color: transparent;
    color: var(--fg-strong);
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  sync-host .host-code-copy:active {
    background-color: var(--surface-interactive-active);
  }
  sync-host .host-code-copy.is-success {
    color: var(--success-fg);
  }
  sync-host .host-code-copy svg {
    width: 16px;
    height: 16px;
    display: block;
  }
  sync-host .host-status {
    font-size: 12rem;
    align-self: center;
    color: var(--fg);
    min-height: 16px;
  }
  sync-host .host-status.is-error { color: var(--error-fg); }
  sync-host .host-status.is-success { color: var(--success-fg); }
`
);
var TEMPLATE = (
  /* html */
  `
  <div class="host-panel">
    <div class="host-header">
      <button class="host-cancel" type="button" title="Cancel">${ICON_X}</button>
      <span class="host-title">Scan the QR code or paste the URL on the other device</span>
    </div>
    <div class="host-qr-wrap"><img class="host-qr" alt="" /></div>
    <div class="host-url-row">
      <input class="host-url" readonly />
      <button class="host-copy" type="button" title="Copy URL">${ICON_COPY}</button>
    </div>
    <div class="host-panel-gap-reset">
      <div class="host-code-section">
        <span class="host-code-label">Type this code on the other device:</span>
        <div class="host-code">
          <span class="host-code-text">------</span>
          <button class="host-code-copy" type="button" title="Copy code">${ICON_COPY}</button>
        </div>
      </div>
      <div class="host-status"></div>
    </div>
  </div>
`
);
var SyncHost = class extends HTMLElement {
  #qrImage;
  #urlInput;
  #copyBtn;
  #cancelBtn;
  #codeText;
  #codeCopyBtn;
  #status;
  #copyTimer = null;
  #codeCopyTimer = null;
  #resetTimer = null;
  #session = null;
  #openToken = null;
  // Peer signer announced over `register_trusted_signer`; folded into the
  // commit when the exchange request lands so trust + secrets persist
  // (or roll back) together.
  #peerSigner = null;
  #intakeToken = null;
  #unsubscribeLocale = null;
  #statusKey = "";
  #statusValues;
  // Wired by the parent sync-panel so cancelling here re-enables sibling
  // toolbar buttons / restores the list.
  list = null;
  toolbarButtons = [];
  onClosed = null;
  connectedCallback() {
    injectComponentStyles("sync-host", STYLES);
    this.innerHTML = TEMPLATE;
    this.#qrImage = this.querySelector(".host-qr");
    this.#urlInput = this.querySelector(".host-url");
    this.#copyBtn = this.querySelector(".host-copy");
    this.#cancelBtn = this.querySelector(".host-cancel");
    this.#codeText = this.querySelector(".host-code-text");
    this.#codeCopyBtn = this.querySelector(".host-code-copy");
    this.#status = this.querySelector(".host-status");
    this.#cancelBtn.addEventListener("click", () => this.close());
    this.#copyBtn.addEventListener("click", this.#onCopyUrl);
    this.#urlInput.addEventListener("focus", () => this.#urlInput.select());
    this.#codeCopyBtn.addEventListener("click", this.#onCopyCode);
    this.#translate();
    this.#unsubscribeLocale = subscribeLocaleChanged(() => this.#translate());
    this.#resetUi();
  }
  disconnectedCallback() {
    if (this.#copyTimer) clearTimeout(this.#copyTimer);
    if (this.#codeCopyTimer) clearTimeout(this.#codeCopyTimer);
    this.#clearResetTimer();
    this.#openToken = null;
    this.#session?.close();
    this.#unsubscribeLocale?.();
    this.#unsubscribeLocale = null;
  }
  open() {
    if (this.hasAttribute("open") || this.#openToken) return;
    this.#clearResetTimer();
    this.#prepareAndStartSession();
  }
  close({ completed = false } = {}) {
    const wasOpen = this.hasAttribute("open");
    const wasPreparing = Boolean(this.#openToken);
    if (!wasOpen && !wasPreparing && !this.#session && !this.#intakeToken) return;
    this.#openToken = null;
    this.removeAttribute("open");
    if (wasOpen) {
      this.list?.exitSelectionMode();
      this.#setToolbarDisabled(false);
    }
    if (wasOpen) this.#resetUiAfterClose();
    else this.#resetUi();
    this.#peerSigner = null;
    if (this.#intakeToken) {
      abortIntake(this.#intakeToken);
      this.#intakeToken = null;
    }
    if (this.#session) {
      const s = this.#session;
      this.#session = null;
      try {
        s.cancel();
      } catch {
      }
    }
    this.onClosed?.({ completed });
  }
  #setToolbarDisabled(disabled) {
    for (const btn of this.toolbarButtons) {
      if (btn) btn.disabled = disabled;
    }
  }
  #resetUi() {
    this.#clearResetTimer();
    this.dataset.codeReady = "";
    this.#urlInput.value = "";
    this.#qrImage.removeAttribute("src");
    this.#copyBtn.disabled = true;
    this.#copyBtn.classList.remove("is-success");
    this.#copyBtn.innerHTML = ICON_COPY;
    this.#codeText.textContent = "------";
    this.#codeCopyBtn.disabled = true;
    this.#codeCopyBtn.classList.remove("is-success");
    this.#codeCopyBtn.innerHTML = ICON_COPY;
    this.#setStatus("", null);
  }
  #resetUiAfterClose() {
    this.#clearResetTimer();
    this.#resetTimer = setTimeout(() => this.#resetUi(), CLOSE_RESET_MS);
  }
  #clearResetTimer() {
    if (!this.#resetTimer) return;
    clearTimeout(this.#resetTimer);
    this.#resetTimer = null;
  }
  async #prepareAndStartSession() {
    const token = {};
    this.#openToken = token;
    this.#resetUi();
    try {
      await ensureRegistered();
      if (this.#openToken !== token) return;
      await this.#startSession();
    } catch (err) {
      if (this.#openToken !== token) return;
      if (err?.name !== "NotAllowedError") {
        console.error("host pairing preparation failed", err?.message ?? err);
      }
      const { message, longMessage } = passkeyPrepareErrorToToast(err);
      this.close();
      error(message, longMessage);
    }
  }
  async #startSession() {
    this.#session = new HostSession({
      onJoinerConnected: () => this.#setStatus("Other device connected: exchanging trust\u2026", null),
      // Code derived right after `connect`; reveal the code section.
      onPairingCode: (code) => {
        this.#codeText.textContent = code;
        this.#codeCopyBtn.disabled = false;
        this.dataset.codeReady = "true";
        this.#setStatus("Waiting: type the code above on the other device.", null);
      },
      onError: (err) => {
        console.error("host session error", err?.message ?? err);
        this.#setStatus("Pairing channel error: try again.", "error");
      },
      // Joiner's device-level signer pubkey + platform label. Stash it for
      // the commit; return our own pair so the session can publish a
      // symmetric `register_trusted_signer` back to the joiner.
      onTrustedSignerReceived: async ({ platform, signerPubkey }) => {
        this.#peerSigner = { pubkey: signerPubkey, platform };
        await ensureRegistered();
        const ourSignerPubkey = await getDeviceSignerPubkey();
        return { signerPubkey: ourSignerPubkey, platform: detectPlatform() };
      },
      // Inbound exchange request — code already validated by the session.
      // Run the inbound prepare/commit BEFORE returning so a commit
      // failure surfaces as an error reply instead of leaving us with
      // the joiner's data committed but our reply unsent.
      onExchangeRequest: async ({ platform: peerPlatform, accounts: peerAccounts }) => {
        return this.#handleExchange(peerPlatform, peerAccounts);
      }
    });
    await this.#session.start();
    if (!this.#openToken || !this.#session) return;
    const url = this.#session.url;
    this.#urlInput.value = url;
    this.#copyBtn.disabled = false;
    try {
      this.#qrImage.src = generateQrDataUrl(url, { cellSize: 6, margin: 4 });
    } catch (err) {
      console.error("qr generation failed", err?.message ?? err);
    }
    if (!this.#openToken) return;
    this.#setStatus("Waiting for the other device to scan or paste the URL.", null);
    this.#openToken = null;
    this.list?.enterSelectionMode();
    this.#setToolbarDisabled(true);
    this.setAttribute("open", "");
  }
  async #handleExchange(peerPlatform, peerAccounts) {
    const token = createIntakeToken();
    this.#intakeToken = token;
    try {
      const selectedPubkeys = this.list?.getSelectedPubkeys() ?? [];
      const accountsToSend = list().filter((a) => selectedPubkeys.includes(a.pubkey));
      let outgoing = { platform: detectPlatform(), accounts: [] };
      if (accountsToSend.length) {
        const entries = await openSecrets();
        if (token.cancelled) throw new Error("IMPORT_CANCELLED");
        outgoing = {
          platform: detectPlatform(),
          ...buildSyncAccountPayload(accountsToSend, entries, {
            nsecFromHex,
            npubFromPubkey
          })
        };
      }
      this.#setStatus("Importing accounts from the other device\u2026", null);
      const prepared = [];
      const errors = [];
      for (let i = peerAccounts.length - 1; i >= 0; i--) {
        if (token.cancelled) throw new Error("IMPORT_CANCELLED");
        try {
          const p = await prepareBareKey(peerAccounts[i], token);
          if (p.skipped) errors.push(p.reason);
          else prepared.push(p);
        } catch (err) {
          if (err?.message === "IMPORT_CANCELLED") throw err;
          errors.push(err?.message ?? String(err));
        }
      }
      if (token.cancelled) throw new Error("IMPORT_CANCELLED");
      const peerSigner = this.#peerSigner ? { pubkey: this.#peerSigner.pubkey, platform: peerPlatform || this.#peerSigner.platform } : null;
      await commitPrepared(prepared, { peerSigner });
      const summary = peerAccounts.length === 0 ? t("Devices synced") : t("Synced: imported {{count}} accounts", { count: prepared.length });
      if (errors.length) warning(t("{{summary}} ({{count}} failed)", { summary, count: errors.length }), errors.join("\n"));
      else success(summary);
      this.#setStatus("Done.", "success");
      setTimeout(() => this.close({ completed: true }), 1200);
      return outgoing;
    } catch (err) {
      this.#setStatus("Sync failed", "error");
      const message = err?.message === "IMPORT_CANCELLED" ? t("Sync cancelled") : t("Sync failed");
      error(message, err?.message ?? String(err));
      throw err;
    } finally {
      if (this.#intakeToken === token) this.#intakeToken = null;
    }
  }
  #onCopyUrl = async () => {
    const value = this.#urlInput.value;
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      this.#copyBtn.classList.add("is-success");
      this.#copyBtn.innerHTML = ICON_CHECK;
      if (this.#copyTimer) clearTimeout(this.#copyTimer);
      this.#copyTimer = setTimeout(() => {
        this.#copyBtn.classList.remove("is-success");
        this.#copyBtn.innerHTML = ICON_COPY;
      }, FLASH_MS);
    } catch (err) {
      console.error("copy failed", err?.message ?? err);
    }
  };
  #onCopyCode = async () => {
    const code = this.#codeText.textContent;
    if (!code || code === "------") return;
    try {
      await navigator.clipboard.writeText(code);
      this.#codeCopyBtn.classList.add("is-success");
      this.#codeCopyBtn.innerHTML = ICON_CHECK;
      if (this.#codeCopyTimer) clearTimeout(this.#codeCopyTimer);
      this.#codeCopyTimer = setTimeout(() => {
        this.#codeCopyBtn.classList.remove("is-success");
        this.#codeCopyBtn.innerHTML = ICON_COPY;
      }, FLASH_MS);
    } catch (err) {
      console.error("copy code failed", err?.message ?? err);
    }
  };
  #setStatus(key, kind, values) {
    this.#statusKey = key;
    this.#statusValues = values;
    this.#status.textContent = key ? t(key, values) : "";
    this.#status.classList.toggle("is-error", kind === "error");
    this.#status.classList.toggle("is-success", kind === "success");
  }
  #translate() {
    if (!this.#cancelBtn) return;
    this.#cancelBtn.title = t("Cancel");
    this.querySelector(".host-title").textContent = t("Scan the QR code or paste the URL on the other device");
    this.#copyBtn.title = t("Copy URL");
    this.querySelector(".host-code-label").textContent = t("Type this code on the other device:");
    this.#codeCopyBtn.title = t("Copy code");
    if (this.#statusKey) this.#status.textContent = t(this.#statusKey, this.#statusValues);
  }
};
function passkeyPrepareErrorToToast(err) {
  if (err?.name === "NotAllowedError") {
    return { message: t("Pairing cancelled"), longMessage: t("The passkey prompt was cancelled.") };
  }
  return { message: t("Pairing failed"), longMessage: err?.message ?? String(err) };
}
customElements.define("sync-host", SyncHost);

// src/components/sync/sync-joiner.js
var ICON_X2 = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6l-12 12" /><path d="M6 6l12 12" /></svg>';
var ICON_CHECK2 = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5l10 -10" /></svg>';
var ICON_ALERT = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4" /><path d="M10.363 3.591l-8.106 13.534a1.914 1.914 0 0 0 1.636 2.871h16.214a1.914 1.914 0 0 0 1.636 -2.87l-8.106 -13.536a1.914 1.914 0 0 0 -3.274 0z" /><path d="M12 16h.01" /></svg>';
var ICON_CAMERA = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 7h2a2 2 0 0 0 2 -2a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1a2 2 0 0 0 2 2h2a2 2 0 0 1 2 2v9a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-9a2 2 0 0 1 2 -2" /><path d="M9 13a3 3 0 1 0 6 0a3 3 0 0 0 -6 0" /></svg>';
var ERROR_FLASH_MS = 1500;
var syncJoinerLocales = {
  ...syncHostLocales,
  ...defineLocales({
    Connect: ["Connecter", "Connetti", "Verbinden", "Conectar", "Conectar", "\u041F\u043E\u0434\u043A\u043B\u044E\u0447\u0438\u0442\u044C", "\u8FDE\u63A5", "\u9023\u7DDA", "\u63A5\u7D9A", "\uC5F0\uACB0"],
    "Scan QR": ["Scanner le QR", "Scansiona QR", "QR scannen", "Escanear QR", "Ler QR", "\u0421\u043A\u0430\u043D\u0438\u0440\u043E\u0432\u0430\u0442\u044C QR", "\u626B\u63CF\u4E8C\u7EF4\u7801", "\u6383\u63CF QR \u78BC", "QR \u3092\u30B9\u30AD\u30E3\u30F3", "QR \uC2A4\uCE94"],
    "Stop scanning": ["Arr\xEAter le scan", "Interrompi scansione", "Scannen beenden", "Detener escaneo", "Parar leitura", "\u041E\u0441\u0442\u0430\u043D\u043E\u0432\u0438\u0442\u044C \u0441\u043A\u0430\u043D\u0438\u0440\u043E\u0432\u0430\u043D\u0438\u0435", "\u505C\u6B62\u626B\u63CF", "\u505C\u6B62\u6383\u63CF", "\u30B9\u30AD\u30E3\u30F3\u3092\u505C\u6B62", "\uC2A4\uCE94 \uC911\uC9C0"],
    "Could not start the camera": ["Impossible de d\xE9marrer la cam\xE9ra", "Impossibile avviare la fotocamera", "Kamera konnte nicht gestartet werden", "No se pudo iniciar la c\xE1mara", "N\xE3o foi poss\xEDvel iniciar a c\xE2mera", "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0437\u0430\u043F\u0443\u0441\u0442\u0438\u0442\u044C \u043A\u0430\u043C\u0435\u0440\u0443", "\u65E0\u6CD5\u542F\u52A8\u76F8\u673A", "\u7121\u6CD5\u555F\u52D5\u76F8\u6A5F", "\u30AB\u30E1\u30E9\u3092\u8D77\u52D5\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F", "\uCE74\uBA54\uB77C\uB97C \uC2DC\uC791\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4"],
    "Type the code shown on the other device:": ["Saisissez le code affich\xE9 sur l\u2019autre appareil :", "Digita il codice mostrato sull\u2019altro dispositivo:", "Den auf dem anderen Ger\xE4t angezeigten Code eingeben:", "Escribe el c\xF3digo mostrado en el otro dispositivo:", "Digite o c\xF3digo mostrado no outro dispositivo:", "\u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u043A\u043E\u0434, \u043F\u043E\u043A\u0430\u0437\u0430\u043D\u043D\u044B\u0439 \u043D\u0430 \u0434\u0440\u0443\u0433\u043E\u043C \u0443\u0441\u0442\u0440\u043E\u0439\u0441\u0442\u0432\u0435:", "\u8F93\u5165\u53E6\u4E00\u53F0\u8BBE\u5907\u4E0A\u663E\u793A\u7684\u4EE3\u7801\uFF1A", "\u8F38\u5165\u53E6\u4E00\u53F0\u88DD\u7F6E\u4E0A\u986F\u793A\u7684\u4EE3\u78BC\uFF1A", "\u5225\u306E\u30C7\u30D0\u30A4\u30B9\u306B\u8868\u793A\u3055\u308C\u305F\u30B3\u30FC\u30C9\u3092\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044\uFF1A", "\uB2E4\uB978 \uAE30\uAE30\uC5D0 \uD45C\uC2DC\uB41C \uCF54\uB4DC\uB97C \uC785\uB825\uD558\uC138\uC694:"],
    "Digit {{number}}": ["Chiffre {{number}}", "Cifra {{number}}", "Ziffer {{number}}", "D\xEDgito {{number}}", "D\xEDgito {{number}}", "\u0426\u0438\u0444\u0440\u0430 {{number}}", "\u7B2C {{number}} \u4F4D", "\u7B2C {{number}} \u4F4D", "{{number}} \u6841\u76EE", "{{number}}\uBC88\uC9F8 \uC22B\uC790"],
    "Paste a nostrpair:// URL or scan the QR shown by the other device.": ["Collez une URL nostrpair:// ou scannez le QR affich\xE9 par l\u2019autre appareil.", "Incolla un URL nostrpair:// o scansiona il QR mostrato dall\u2019altro dispositivo.", "Eine nostrpair://-URL einf\xFCgen oder den QR-Code des anderen Ger\xE4ts scannen.", "Pega una URL nostrpair:// o escanea el QR mostrado por el otro dispositivo.", "Cole uma URL nostrpair:// ou leia o QR exibido pelo outro dispositivo.", "\u0412\u0441\u0442\u0430\u0432\u044C\u0442\u0435 URL nostrpair:// \u0438\u043B\u0438 \u043E\u0442\u0441\u043A\u0430\u043D\u0438\u0440\u0443\u0439\u0442\u0435 QR-\u043A\u043E\u0434 \u043D\u0430 \u0434\u0440\u0443\u0433\u043E\u043C \u0443\u0441\u0442\u0440\u043E\u0439\u0441\u0442\u0432\u0435.", "\u7C98\u8D34 nostrpair:// URL\uFF0C\u6216\u626B\u63CF\u53E6\u4E00\u53F0\u8BBE\u5907\u663E\u793A\u7684\u4E8C\u7EF4\u7801\u3002", "\u8CBC\u4E0A nostrpair:// URL\uFF0C\u6216\u6383\u63CF\u53E6\u4E00\u53F0\u88DD\u7F6E\u986F\u793A\u7684 QR \u78BC\u3002", "nostrpair:// URL \u3092\u8CBC\u308A\u4ED8\u3051\u308B\u304B\u3001\u5225\u306E\u30C7\u30D0\u30A4\u30B9\u306E QR \u30B3\u30FC\u30C9\u3092\u30B9\u30AD\u30E3\u30F3\u3057\u3066\u304F\u3060\u3055\u3044\u3002", "nostrpair:// URL\uC744 \uBD99\uC5EC \uB123\uAC70\uB098 \uB2E4\uB978 \uAE30\uAE30\uC758 QR \uCF54\uB4DC\uB97C \uC2A4\uCE94\uD558\uC138\uC694."],
    "Connecting\u2026": ["Connexion\u2026", "Connessione\u2026", "Verbindung wird hergestellt\u2026", "Conectando\u2026", "Conectando\u2026", "\u041F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0435\u2026", "\u6B63\u5728\u8FDE\u63A5\u2026", "\u6B63\u5728\u9023\u7DDA\u2026", "\u63A5\u7D9A\u4E2D\u2026", "\uC5F0\uACB0 \uC911\u2026"],
    "Connected: exchanging trust\u2026": ["Connect\xE9 : \xE9change de confiance\u2026", "Connesso: scambio di fiducia\u2026", "Verbunden: Vertrauen wird ausgetauscht\u2026", "Conectado: intercambiando confianza\u2026", "Conectado: trocando confian\xE7a\u2026", "\u041F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u043E: \u043E\u0431\u043C\u0435\u043D \u0434\u043E\u0432\u0435\u0440\u0438\u0435\u043C\u2026", "\u5DF2\u8FDE\u63A5\uFF1A\u6B63\u5728\u4EA4\u6362\u4FE1\u4EFB\u4FE1\u606F\u2026", "\u5DF2\u9023\u7DDA\uFF1A\u6B63\u5728\u4EA4\u63DB\u4FE1\u4EFB\u8CC7\u8A0A\u2026", "\u63A5\u7D9A\u6E08\u307F\uFF1A\u4FE1\u983C\u60C5\u5831\u3092\u4EA4\u63DB\u4E2D\u2026", "\uC5F0\uACB0\uB428: \uC2E0\uB8B0 \uC815\uBCF4 \uAD50\uD658 \uC911\u2026"],
    "Pairing channel error.": ["Erreur du canal d\u2019association.", "Errore del canale di associazione.", "Fehler im Kopplungskanal.", "Error del canal de emparejamiento.", "Erro no canal de pareamento.", "\u041E\u0448\u0438\u0431\u043A\u0430 \u043A\u0430\u043D\u0430\u043B\u0430 \u0441\u043E\u043F\u0440\u044F\u0436\u0435\u043D\u0438\u044F.", "\u914D\u5BF9\u901A\u9053\u51FA\u9519\u3002", "\u914D\u5C0D\u901A\u9053\u932F\u8AA4\u3002", "\u30DA\u30A2\u30EA\u30F3\u30B0\u30C1\u30E3\u30CD\u30EB\u30A8\u30E9\u30FC\u3002", "\uD398\uC5B4\uB9C1 \uCC44\uB110 \uC624\uB958."],
    "Code matched: exchanging trust\u2026": ["Code v\xE9rifi\xE9 : \xE9change de confiance\u2026", "Codice verificato: scambio di fiducia\u2026", "Code stimmt: Vertrauen wird ausgetauscht\u2026", "C\xF3digo correcto: intercambiando confianza\u2026", "C\xF3digo correto: trocando confian\xE7a\u2026", "\u041A\u043E\u0434 \u0441\u043E\u0432\u043F\u0430\u043B: \u043E\u0431\u043C\u0435\u043D \u0434\u043E\u0432\u0435\u0440\u0438\u0435\u043C\u2026", "\u4EE3\u7801\u5339\u914D\uFF1A\u6B63\u5728\u4EA4\u6362\u4FE1\u4EFB\u4FE1\u606F\u2026", "\u4EE3\u78BC\u76F8\u7B26\uFF1A\u6B63\u5728\u4EA4\u63DB\u4FE1\u4EFB\u8CC7\u8A0A\u2026", "\u30B3\u30FC\u30C9\u4E00\u81F4\uFF1A\u4FE1\u983C\u60C5\u5831\u3092\u4EA4\u63DB\u4E2D\u2026", "\uCF54\uB4DC \uC77C\uCE58: \uC2E0\uB8B0 \uC815\uBCF4 \uAD50\uD658 \uC911\u2026"],
    "Switch back to this tab to continue\u2026": ["Revenez \xE0 cet onglet pour continuer\u2026", "Torna a questa scheda per continuare\u2026", "Zu diesem Tab zur\xFCckkehren, um fortzufahren\u2026", "Vuelve a esta pesta\xF1a para continuar\u2026", "Volte para esta aba para continuar\u2026", "\u0412\u0435\u0440\u043D\u0438\u0442\u0435\u0441\u044C \u043D\u0430 \u044D\u0442\u0443 \u0432\u043A\u043B\u0430\u0434\u043A\u0443, \u0447\u0442\u043E\u0431\u044B \u043F\u0440\u043E\u0434\u043E\u043B\u0436\u0438\u0442\u044C\u2026", "\u8BF7\u8FD4\u56DE\u6B64\u6807\u7B7E\u9875\u4EE5\u7EE7\u7EED\u2026", "\u8ACB\u8FD4\u56DE\u6B64\u5206\u9801\u4EE5\u7E7C\u7E8C\u2026", "\u7D9A\u884C\u3059\u308B\u306B\u306F\u3053\u306E\u30BF\u30D6\u306B\u623B\u3063\u3066\u304F\u3060\u3055\u3044\u2026", "\uACC4\uC18D\uD558\uB824\uBA74 \uC774 \uD0ED\uC73C\uB85C \uB3CC\uC544\uC624\uC138\uC694\u2026"],
    "Sending accounts\u2026": ["Envoi des comptes\u2026", "Invio degli account\u2026", "Konten werden gesendet\u2026", "Enviando cuentas\u2026", "Enviando contas\u2026", "\u041E\u0442\u043F\u0440\u0430\u0432\u043A\u0430 \u0443\u0447\u0451\u0442\u043D\u044B\u0445 \u0437\u0430\u043F\u0438\u0441\u0435\u0439\u2026", "\u6B63\u5728\u53D1\u9001\u8D26\u6237\u2026", "\u6B63\u5728\u50B3\u9001\u5E33\u6236\u2026", "\u30A2\u30AB\u30A6\u30F3\u30C8\u3092\u9001\u4FE1\u4E2D\u2026", "\uACC4\uC815 \uC804\uC1A1 \uC911\u2026"],
    "Importing {{count}} accounts\u2026": ["Importation de {{count}} comptes\u2026", "Importazione di {{count}} account\u2026", "{{count}} Konten werden importiert\u2026", "Importando {{count}} cuentas\u2026", "Importando {{count}} contas\u2026", "\u0418\u043C\u043F\u043E\u0440\u0442 \u0443\u0447\u0451\u0442\u043D\u044B\u0445 \u0437\u0430\u043F\u0438\u0441\u0435\u0439: {{count}}\u2026", "\u6B63\u5728\u5BFC\u5165 {{count}} \u4E2A\u8D26\u6237\u2026", "\u6B63\u5728\u532F\u5165 {{count}} \u500B\u5E33\u6236\u2026", "{{count}} \u4EF6\u306E\u30A2\u30AB\u30A6\u30F3\u30C8\u3092\u30A4\u30F3\u30DD\u30FC\u30C8\u4E2D\u2026", "\uACC4\uC815 {{count}}\uAC1C \uAC00\uC838\uC624\uB294 \uC911\u2026"],
    "Storing trust\u2026": ["Enregistrement de la confiance\u2026", "Salvataggio della fiducia\u2026", "Vertrauen wird gespeichert\u2026", "Guardando confianza\u2026", "Salvando confian\xE7a\u2026", "\u0421\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u0438\u0435 \u0434\u043E\u0432\u0435\u0440\u0438\u044F\u2026", "\u6B63\u5728\u4FDD\u5B58\u4FE1\u4EFB\u4FE1\u606F\u2026", "\u6B63\u5728\u5132\u5B58\u4FE1\u4EFB\u8CC7\u8A0A\u2026", "\u4FE1\u983C\u60C5\u5831\u3092\u4FDD\u5B58\u4E2D\u2026", "\uC2E0\uB8B0 \uC815\uBCF4 \uC800\uC7A5 \uC911\u2026"],
    "Error. Try again.": ["Erreur. R\xE9essayez.", "Errore. Riprova.", "Fehler. Erneut versuchen.", "Error. Int\xE9ntalo de nuevo.", "Erro. Tente novamente.", "\u041E\u0448\u0438\u0431\u043A\u0430. \u041F\u043E\u043F\u0440\u043E\u0431\u0443\u0439\u0442\u0435 \u0435\u0449\u0451 \u0440\u0430\u0437.", "\u51FA\u9519\u4E86\uFF0C\u8BF7\u91CD\u8BD5\u3002", "\u767C\u751F\u932F\u8AA4\uFF0C\u8ACB\u91CD\u8A66\u3002", "\u30A8\u30E9\u30FC\u3067\u3059\u3002\u3082\u3046\u4E00\u5EA6\u304A\u8A66\u3057\u304F\u3060\u3055\u3044\u3002", "\uC624\uB958\uC785\uB2C8\uB2E4. \uB2E4\uC2DC \uC2DC\uB3C4\uD558\uC138\uC694."],
    "Code mismatch: check the digits on the other device.": ["Code incorrect : v\xE9rifiez les chiffres sur l\u2019autre appareil.", "Codice errato: controlla le cifre sull\u2019altro dispositivo.", "Code stimmt nicht: Ziffern auf dem anderen Ger\xE4t pr\xFCfen.", "El c\xF3digo no coincide: comprueba los d\xEDgitos del otro dispositivo.", "C\xF3digo incorreto: confira os d\xEDgitos no outro dispositivo.", "\u041A\u043E\u0434 \u043D\u0435 \u0441\u043E\u0432\u043F\u0430\u0434\u0430\u0435\u0442: \u043F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435 \u0446\u0438\u0444\u0440\u044B \u043D\u0430 \u0434\u0440\u0443\u0433\u043E\u043C \u0443\u0441\u0442\u0440\u043E\u0439\u0441\u0442\u0432\u0435.", "\u4EE3\u7801\u4E0D\u5339\u914D\uFF1A\u8BF7\u68C0\u67E5\u53E6\u4E00\u53F0\u8BBE\u5907\u4E0A\u7684\u6570\u5B57\u3002", "\u4EE3\u78BC\u4E0D\u7B26\uFF1A\u8ACB\u6AA2\u67E5\u53E6\u4E00\u53F0\u88DD\u7F6E\u4E0A\u7684\u6578\u5B57\u3002", "\u30B3\u30FC\u30C9\u304C\u4E00\u81F4\u3057\u307E\u305B\u3093\uFF1A\u5225\u306E\u30C7\u30D0\u30A4\u30B9\u306E\u6570\u5B57\u3092\u78BA\u8A8D\u3057\u3066\u304F\u3060\u3055\u3044\u3002", "\uCF54\uB4DC \uBD88\uC77C\uCE58: \uB2E4\uB978 \uAE30\uAE30\uC758 \uC22B\uC790\uB97C \uD655\uC778\uD558\uC138\uC694."],
    "Pairing timed out": ["D\xE9lai d\u2019association d\xE9pass\xE9", "Tempo di associazione scaduto", "Zeit\xFCberschreitung bei der Kopplung", "Tiempo de emparejamiento agotado", "Tempo de pareamento esgotado", "\u0412\u0440\u0435\u043C\u044F \u0441\u043E\u043F\u0440\u044F\u0436\u0435\u043D\u0438\u044F \u0438\u0441\u0442\u0435\u043A\u043B\u043E", "\u914D\u5BF9\u8D85\u65F6", "\u914D\u5C0D\u903E\u6642", "\u30DA\u30A2\u30EA\u30F3\u30B0\u304C\u30BF\u30A4\u30E0\u30A2\u30A6\u30C8\u3057\u307E\u3057\u305F", "\uD398\uC5B4\uB9C1 \uC2DC\uAC04 \uCD08\uACFC"],
    "The other device did not respond in time.": ["L\u2019autre appareil n\u2019a pas r\xE9pondu \xE0 temps.", "L\u2019altro dispositivo non ha risposto in tempo.", "Das andere Ger\xE4t hat nicht rechtzeitig geantwortet.", "El otro dispositivo no respondi\xF3 a tiempo.", "O outro dispositivo n\xE3o respondeu a tempo.", "\u0414\u0440\u0443\u0433\u043E\u0435 \u0443\u0441\u0442\u0440\u043E\u0439\u0441\u0442\u0432\u043E \u043D\u0435 \u043E\u0442\u0432\u0435\u0442\u0438\u043B\u043E \u0432\u043E\u0432\u0440\u0435\u043C\u044F.", "\u53E6\u4E00\u53F0\u8BBE\u5907\u672A\u53CA\u65F6\u54CD\u5E94\u3002", "\u53E6\u4E00\u53F0\u88DD\u7F6E\u672A\u53CA\u6642\u56DE\u61C9\u3002", "\u5225\u306E\u30C7\u30D0\u30A4\u30B9\u304C\u6642\u9593\u5185\u306B\u5FDC\u7B54\u3057\u307E\u305B\u3093\u3067\u3057\u305F\u3002", "\uB2E4\uB978 \uAE30\uAE30\uAC00 \uC81C\uC2DC\uAC04\uC5D0 \uC751\uB2F5\uD558\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4."],
    "Pairing rejected": ["Association refus\xE9e", "Associazione rifiutata", "Kopplung abgelehnt", "Emparejamiento rechazado", "Pareamento recusado", "\u0421\u043E\u043F\u0440\u044F\u0436\u0435\u043D\u0438\u0435 \u043E\u0442\u043A\u043B\u043E\u043D\u0435\u043D\u043E", "\u914D\u5BF9\u88AB\u62D2\u7EDD", "\u914D\u5C0D\u906D\u62D2", "\u30DA\u30A2\u30EA\u30F3\u30B0\u304C\u62D2\u5426\u3055\u308C\u307E\u3057\u305F", "\uD398\uC5B4\uB9C1 \uAC70\uBD80\uB428"],
    "The other device declined the request.": ["L\u2019autre appareil a refus\xE9 la demande.", "L\u2019altro dispositivo ha rifiutato la richiesta.", "Das andere Ger\xE4t hat die Anfrage abgelehnt.", "El otro dispositivo rechaz\xF3 la solicitud.", "O outro dispositivo recusou a solicita\xE7\xE3o.", "\u0414\u0440\u0443\u0433\u043E\u0435 \u0443\u0441\u0442\u0440\u043E\u0439\u0441\u0442\u0432\u043E \u043E\u0442\u043A\u043B\u043E\u043D\u0438\u043B\u043E \u0437\u0430\u043F\u0440\u043E\u0441.", "\u53E6\u4E00\u53F0\u8BBE\u5907\u62D2\u7EDD\u4E86\u8BF7\u6C42\u3002", "\u53E6\u4E00\u53F0\u88DD\u7F6E\u62D2\u7D55\u4E86\u8981\u6C42\u3002", "\u5225\u306E\u30C7\u30D0\u30A4\u30B9\u304C\u30EA\u30AF\u30A8\u30B9\u30C8\u3092\u62D2\u5426\u3057\u307E\u3057\u305F\u3002", "\uB2E4\uB978 \uAE30\uAE30\uAC00 \uC694\uCCAD\uC744 \uAC70\uBD80\uD588\uC2B5\uB2C8\uB2E4."],
    "Got an unexpected response from the other device.": ["R\xE9ponse inattendue de l\u2019autre appareil.", "Risposta imprevista dall\u2019altro dispositivo.", "Unerwartete Antwort vom anderen Ger\xE4t.", "Se recibi\xF3 una respuesta inesperada del otro dispositivo.", "O outro dispositivo enviou uma resposta inesperada.", "\u041F\u043E\u043B\u0443\u0447\u0435\u043D \u043D\u0435\u043E\u0436\u0438\u0434\u0430\u043D\u043D\u044B\u0439 \u043E\u0442\u0432\u0435\u0442 \u043E\u0442 \u0434\u0440\u0443\u0433\u043E\u0433\u043E \u0443\u0441\u0442\u0440\u043E\u0439\u0441\u0442\u0432\u0430.", "\u6536\u5230\u53E6\u4E00\u53F0\u8BBE\u5907\u7684\u610F\u5916\u54CD\u5E94\u3002", "\u6536\u5230\u53E6\u4E00\u53F0\u88DD\u7F6E\u7684\u975E\u9810\u671F\u56DE\u61C9\u3002", "\u5225\u306E\u30C7\u30D0\u30A4\u30B9\u304B\u3089\u4E88\u671F\u3057\u306A\u3044\u5FDC\u7B54\u304C\u3042\u308A\u307E\u3057\u305F\u3002", "\uB2E4\uB978 \uAE30\uAE30\uC5D0\uC11C \uC608\uC0C1\uCE58 \uBABB\uD55C \uC751\uB2F5\uC744 \uBC1B\uC558\uC2B5\uB2C8\uB2E4."],
    "Pairing relay failed": ["\xC9chec du relais d\u2019association", "Relay di associazione non riuscito", "Kopplungs-Relay fehlgeschlagen", "Fall\xF3 el relay de emparejamiento", "Falha no relay de pareamento", "\u041E\u0448\u0438\u0431\u043A\u0430 \u0440\u0435\u0442\u0440\u0430\u043D\u0441\u043B\u044F\u0442\u043E\u0440\u0430 \u0441\u043E\u043F\u0440\u044F\u0436\u0435\u043D\u0438\u044F", "\u914D\u5BF9\u4E2D\u7EE7\u5931\u8D25", "\u914D\u5C0D\u4E2D\u7E7C\u5931\u6557", "\u30DA\u30A2\u30EA\u30F3\u30B0\u30EA\u30EC\u30FC\u306B\u5931\u6557\u3057\u307E\u3057\u305F", "\uD398\uC5B4\uB9C1 \uB9B4\uB808\uC774 \uC2E4\uD328"],
    "The relay did not accept the pairing message. Try again, or generate a fresh pairing URL.": ["Le relais n\u2019a pas accept\xE9 le message d\u2019association. R\xE9essayez ou g\xE9n\xE9rez une nouvelle URL.", "Il relay non ha accettato il messaggio di associazione. Riprova o genera un nuovo URL.", "Das Relay hat die Kopplungsnachricht nicht akzeptiert. Erneut versuchen oder eine neue URL erzeugen.", "El relay no acept\xF3 el mensaje de emparejamiento. Int\xE9ntalo de nuevo o genera una URL nueva.", "O relay n\xE3o aceitou a mensagem de pareamento. Tente novamente ou gere uma nova URL.", "\u0420\u0435\u0442\u0440\u0430\u043D\u0441\u043B\u044F\u0442\u043E\u0440 \u043D\u0435 \u043F\u0440\u0438\u043D\u044F\u043B \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u0435 \u0441\u043E\u043F\u0440\u044F\u0436\u0435\u043D\u0438\u044F. \u041F\u043E\u0432\u0442\u043E\u0440\u0438\u0442\u0435 \u043F\u043E\u043F\u044B\u0442\u043A\u0443 \u0438\u043B\u0438 \u0441\u043E\u0437\u0434\u0430\u0439\u0442\u0435 \u043D\u043E\u0432\u044B\u0439 URL.", "\u4E2D\u7EE7\u672A\u63A5\u53D7\u914D\u5BF9\u6D88\u606F\u3002\u8BF7\u91CD\u8BD5\u6216\u751F\u6210\u65B0\u7684\u914D\u5BF9 URL\u3002", "\u4E2D\u7E7C\u672A\u63A5\u53D7\u914D\u5C0D\u8A0A\u606F\u3002\u8ACB\u91CD\u8A66\u6216\u7522\u751F\u65B0\u7684\u914D\u5C0D URL\u3002", "\u30EA\u30EC\u30FC\u304C\u30DA\u30A2\u30EA\u30F3\u30B0\u30E1\u30C3\u30BB\u30FC\u30B8\u3092\u53D7\u3051\u4ED8\u3051\u307E\u305B\u3093\u3067\u3057\u305F\u3002\u518D\u8A66\u884C\u3059\u308B\u304B\u3001\u65B0\u3057\u3044 URL \u3092\u751F\u6210\u3057\u3066\u304F\u3060\u3055\u3044\u3002", "\uB9B4\uB808\uC774\uAC00 \uD398\uC5B4\uB9C1 \uBA54\uC2DC\uC9C0\uB97C \uC218\uB77D\uD558\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4. \uB2E4\uC2DC \uC2DC\uB3C4\uD558\uAC70\uB098 \uC0C8 URL\uC744 \uC0DD\uC131\uD558\uC138\uC694."],
    "Trust exchange failed": ["\xC9chec de l\u2019\xE9change de confiance", "Scambio di fiducia non riuscito", "Vertrauensaustausch fehlgeschlagen", "Fall\xF3 el intercambio de confianza", "Falha na troca de confian\xE7a", "\u041E\u0448\u0438\u0431\u043A\u0430 \u043E\u0431\u043C\u0435\u043D\u0430 \u0434\u043E\u0432\u0435\u0440\u0438\u0435\u043C", "\u4FE1\u4EFB\u4EA4\u6362\u5931\u8D25", "\u4FE1\u4EFB\u4EA4\u63DB\u5931\u6557", "\u4FE1\u983C\u60C5\u5831\u306E\u4EA4\u63DB\u306B\u5931\u6557\u3057\u307E\u3057\u305F", "\uC2E0\uB8B0 \uC815\uBCF4 \uAD50\uD658 \uC2E4\uD328"],
    "The other device could not store this device's signer key.": ["L\u2019autre appareil n\u2019a pas pu enregistrer la cl\xE9 de signature de cet appareil.", "L\u2019altro dispositivo non ha potuto salvare la chiave di firma di questo dispositivo.", "Das andere Ger\xE4t konnte den Signaturschl\xFCssel dieses Ger\xE4ts nicht speichern.", "El otro dispositivo no pudo guardar la clave de firma de este dispositivo.", "O outro dispositivo n\xE3o p\xF4de salvar a chave de assinatura deste dispositivo.", "\u0414\u0440\u0443\u0433\u043E\u0435 \u0443\u0441\u0442\u0440\u043E\u0439\u0441\u0442\u0432\u043E \u043D\u0435 \u0441\u043C\u043E\u0433\u043B\u043E \u0441\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C \u043A\u043B\u044E\u0447 \u043F\u043E\u0434\u043F\u0438\u0441\u0438 \u044D\u0442\u043E\u0433\u043E \u0443\u0441\u0442\u0440\u043E\u0439\u0441\u0442\u0432\u0430.", "\u53E6\u4E00\u53F0\u8BBE\u5907\u65E0\u6CD5\u4FDD\u5B58\u6B64\u8BBE\u5907\u7684\u7B7E\u540D\u5BC6\u94A5\u3002", "\u53E6\u4E00\u53F0\u88DD\u7F6E\u7121\u6CD5\u5132\u5B58\u6B64\u88DD\u7F6E\u7684\u7C3D\u7F72\u91D1\u9470\u3002", "\u5225\u306E\u30C7\u30D0\u30A4\u30B9\u306F\u3053\u306E\u30C7\u30D0\u30A4\u30B9\u306E\u7F72\u540D\u9375\u3092\u4FDD\u5B58\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F\u3002", "\uB2E4\uB978 \uAE30\uAE30\uAC00 \uC774 \uAE30\uAE30\uC758 \uC11C\uBA85 \uD0A4\uB97C \uC800\uC7A5\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4."],
    "Pairing device locked": ["Appareil d\u2019association verrouill\xE9", "Dispositivo di associazione bloccato", "Kopplungsger\xE4t gesperrt", "Dispositivo de emparejamiento bloqueado", "Dispositivo de pareamento bloqueado", "\u0423\u0441\u0442\u0440\u043E\u0439\u0441\u0442\u0432\u043E \u0441\u043E\u043F\u0440\u044F\u0436\u0435\u043D\u0438\u044F \u0437\u0430\u0431\u043B\u043E\u043A\u0438\u0440\u043E\u0432\u0430\u043D\u043E", "\u914D\u5BF9\u8BBE\u5907\u5DF2\u9501\u5B9A", "\u914D\u5C0D\u88DD\u7F6E\u5DF2\u9396\u5B9A", "\u30DA\u30A2\u30EA\u30F3\u30B0\u3059\u308B\u30C7\u30D0\u30A4\u30B9\u304C\u30ED\u30C3\u30AF\u3055\u308C\u3066\u3044\u307E\u3059", "\uD398\uC5B4\uB9C1 \uAE30\uAE30 \uC7A0\uAE40"],
    "Unlock or create the passkey on the other device, then try pairing again.": ["D\xE9verrouillez ou cr\xE9ez la cl\xE9 d\u2019acc\xE8s sur l\u2019autre appareil, puis r\xE9essayez.", "Sblocca o crea la passkey sull\u2019altro dispositivo, poi riprova.", "Passkey auf dem anderen Ger\xE4t entsperren oder erstellen und erneut versuchen.", "Desbloquea o crea la passkey en el otro dispositivo y vuelve a intentarlo.", "Desbloqueie ou crie a passkey no outro dispositivo e tente novamente.", "\u0420\u0430\u0437\u0431\u043B\u043E\u043A\u0438\u0440\u0443\u0439\u0442\u0435 \u0438\u043B\u0438 \u0441\u043E\u0437\u0434\u0430\u0439\u0442\u0435 \u043A\u043B\u044E\u0447 \u0434\u043E\u0441\u0442\u0443\u043F\u0430 \u043D\u0430 \u0434\u0440\u0443\u0433\u043E\u043C \u0443\u0441\u0442\u0440\u043E\u0439\u0441\u0442\u0432\u0435 \u0438 \u043F\u043E\u0432\u0442\u043E\u0440\u0438\u0442\u0435 \u043F\u043E\u043F\u044B\u0442\u043A\u0443.", "\u8BF7\u5728\u53E6\u4E00\u53F0\u8BBE\u5907\u4E0A\u89E3\u9501\u6216\u521B\u5EFA\u901A\u884C\u5BC6\u94A5\uFF0C\u7136\u540E\u91CD\u8BD5\u3002", "\u8ACB\u5728\u53E6\u4E00\u53F0\u88DD\u7F6E\u4E0A\u89E3\u9396\u6216\u5EFA\u7ACB\u901A\u884C\u91D1\u9470\uFF0C\u7136\u5F8C\u91CD\u8A66\u3002", "\u5225\u306E\u30C7\u30D0\u30A4\u30B9\u3067\u30D1\u30B9\u30AD\u30FC\u3092\u89E3\u9664\u307E\u305F\u306F\u4F5C\u6210\u3057\u3066\u304B\u3089\u3001\u3082\u3046\u4E00\u5EA6\u304A\u8A66\u3057\u304F\u3060\u3055\u3044\u3002", "\uB2E4\uB978 \uAE30\uAE30\uC5D0\uC11C \uD328\uC2A4\uD0A4\uB97C \uC7A0\uAE08 \uD574\uC81C\uD558\uAC70\uB098 \uB9CC\uB4E0 \uB4A4 \uB2E4\uC2DC \uC2DC\uB3C4\uD558\uC138\uC694."],
    "Code mismatch": ["Code incorrect", "Codice errato", "Code stimmt nicht", "El c\xF3digo no coincide", "C\xF3digo incorreto", "\u041A\u043E\u0434 \u043D\u0435 \u0441\u043E\u0432\u043F\u0430\u0434\u0430\u0435\u0442", "\u4EE3\u7801\u4E0D\u5339\u914D", "\u4EE3\u78BC\u4E0D\u7B26", "\u30B3\u30FC\u30C9\u304C\u4E00\u81F4\u3057\u307E\u305B\u3093", "\uCF54\uB4DC \uBD88\uC77C\uCE58"],
    "Double-check the digits shown on the other device.": ["V\xE9rifiez les chiffres affich\xE9s sur l\u2019autre appareil.", "Ricontrolla le cifre mostrate sull\u2019altro dispositivo.", "Die Ziffern auf dem anderen Ger\xE4t erneut pr\xFCfen.", "Comprueba los d\xEDgitos mostrados en el otro dispositivo.", "Confira os d\xEDgitos exibidos no outro dispositivo.", "\u041F\u0435\u0440\u0435\u043F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435 \u0446\u0438\u0444\u0440\u044B \u043D\u0430 \u0434\u0440\u0443\u0433\u043E\u043C \u0443\u0441\u0442\u0440\u043E\u0439\u0441\u0442\u0432\u0435.", "\u8BF7\u518D\u6B21\u6838\u5BF9\u53E6\u4E00\u53F0\u8BBE\u5907\u4E0A\u663E\u793A\u7684\u6570\u5B57\u3002", "\u8ACB\u518D\u6B21\u6838\u5C0D\u53E6\u4E00\u53F0\u88DD\u7F6E\u4E0A\u986F\u793A\u7684\u6578\u5B57\u3002", "\u5225\u306E\u30C7\u30D0\u30A4\u30B9\u306B\u8868\u793A\u3055\u308C\u305F\u6570\u5B57\u3092\u3082\u3046\u4E00\u5EA6\u78BA\u8A8D\u3057\u3066\u304F\u3060\u3055\u3044\u3002", "\uB2E4\uB978 \uAE30\uAE30\uC5D0 \uD45C\uC2DC\uB41C \uC22B\uC790\uB97C \uB2E4\uC2DC \uD655\uC778\uD558\uC138\uC694."],
    "Invalid pairing URL": ["URL d\u2019association invalide", "URL di associazione non valido", "Ung\xFCltige Kopplungs-URL", "URL de emparejamiento no v\xE1lida", "URL de pareamento inv\xE1lida", "\u041D\u0435\u0434\u043E\u043F\u0443\u0441\u0442\u0438\u043C\u044B\u0439 URL \u0441\u043E\u043F\u0440\u044F\u0436\u0435\u043D\u0438\u044F", "\u914D\u5BF9 URL \u65E0\u6548", "\u914D\u5C0D URL \u7121\u6548", "\u30DA\u30A2\u30EA\u30F3\u30B0 URL \u304C\u7121\u52B9\u3067\u3059", "\uC798\uBABB\uB41C \uD398\uC5B4\uB9C1 URL"]
  })
};
var t2 = getT(syncJoinerLocales);
var STYLES2 = (
  /* css */
  `
  sync-joiner {
    display: block;
    overflow: hidden;
    max-height: 0;
    transition: max-height 280ms ease-out;
  }
  sync-joiner[open] {
    max-height: 80px;
  }
  /* Once a URL is parsed and the session is live, reveal the OTP + status
     panel below the URL input. */
  sync-joiner[open][data-pair="active"] {
    max-height: 240px;
  }
  sync-joiner[open][data-scanning="true"] {
    max-height: 420px;
  }
  sync-joiner .joiner-form {
    position: relative;
    padding-top: 12px;
  }
  sync-joiner .joiner-input {
    padding-left: 36px;
    padding-right: 42px;
    background-color: var(--surface-interactive);
  }
  sync-joiner[data-camera="true"] .joiner-input {
    padding-right: 78px;
  }
  sync-joiner .joiner-btn {
    position: absolute;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--fg-strong);
  }
  sync-joiner .joiner-btn:disabled {
    opacity: 0.6;
  }
  sync-joiner .joiner-btn[data-action="cancel"] {
    top: calc(50% + 6px);
    transform: translateY(-50%);
    left: 5px;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background-color: transparent;
  }
  sync-joiner .joiner-btn[data-action="cancel"]:active {
    background-color: var(--surface-interactive-active);
  }
  sync-joiner .joiner-btn[data-action="scan"] {
    top: calc(50% + 6px);
    transform: translateY(-50%);
    right: 42px;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background-color: transparent;
    display: none;
  }
  sync-joiner[data-camera="true"] .joiner-btn[data-action="scan"] {
    display: inline-flex;
  }
  sync-joiner .joiner-btn[data-action="scan"]:active {
    background-color: var(--surface-interactive-active);
  }
  sync-joiner .joiner-btn[data-action="connect"] {
    top: 12px;
    right: 0;
    bottom: 0;
    width: 36px;
    border-radius: 0 7px 7px 0;
    background-color: var(--success);
  }
  sync-joiner .joiner-btn[data-action="connect"]:active {
    background-color: var(--success-active);
  }
  sync-joiner .joiner-btn[data-action="connect"].is-error {
    background-color: var(--error);
    color: var(--fg-on-accent);
  }
  sync-joiner .joiner-btn-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  sync-joiner .joiner-btn-icon svg {
    width: 14px;
    height: 14px;
    display: block;
  }
  sync-joiner .joiner-btn[data-action="scan"] svg {
    width: 16px;
    height: 16px;
  }
  /* Pair-active panel \u2014 code input + status. Sized via container heights. */
  sync-joiner .pair-panel {
    display: none;
    flex-direction: column;
    gap: 10px;
    padding-top: 14px;
  }
  sync-joiner[data-pair="active"] .pair-panel {
    display: flex;
  }
  sync-joiner .pair-label {
    font-size: 14rem;
    font-weight: 600;
    color: var(--fg);
    align-self: center;
  }
  /* OTP-style: six separate cells, equally spaced. flex: 1 1 0 + min-width: 0
     lets them shrink as the panel narrows so they never overflow. */
  sync-joiner .pair-pin {
    display: flex;
    justify-content: center;
    gap: 8px;
  }
  sync-joiner .pin-cell {
    flex: 1 1 0;
    min-width: 0;
    max-width: 32px;
    width: auto;
    height: 52px;
    padding: 0;
    text-align: center;
    font-size: 22rem;
    font-variant-numeric: tabular-nums;
    background-color: var(--surface-interactive);
    border: 1px solid transparent;
    border-radius: 6px;
    outline: none;
    -moz-appearance: textfield;
  }
  sync-joiner .pin-cell::-webkit-outer-spin-button,
  sync-joiner .pin-cell::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }
  sync-joiner .pin-cell:focus {
    border-color: var(--success);
    background-color: var(--surface-interactive);
  }
  sync-joiner .pin-cell:disabled {
    opacity: 0.6;
  }
  sync-joiner .pair-pin.is-error .pin-cell {
    background-color: oklch(from var(--error) l c h / 0.5);
  }
  sync-joiner .pair-status {
    font-size: 12rem;
    align-self: center;
    color: var(--fg);
    min-height: 16px;
  }
  sync-joiner .pair-status.is-error { color: var(--error-fg); }
  sync-joiner .pair-status.is-success { color: var(--success-fg); }
  sync-joiner .scan-overlay {
    display: none;
    flex-direction: column;
    gap: 8px;
    padding-top: 14px;
  }
  sync-joiner[data-scanning="true"] .scan-overlay {
    display: flex;
  }
  sync-joiner[data-scanning="true"] .joiner-form,
  sync-joiner[data-scanning="true"] .pair-panel {
    display: none;
  }
  sync-joiner .scan-video-wrap {
    position: relative;
  }
  sync-joiner .scan-video {
    width: 100%;
    max-height: 320px;
    border-radius: 8px;
    background-color: var(--surface-sunken);
    object-fit: cover;
    display: block;
  }
  sync-joiner .scan-stop {
    position: absolute;
    top: 8px;
    right: 8px;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background-color: var(--scrim);
    color: var(--fg-on-accent);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    filter: drop-shadow(0 1px 2px var(--shadow-strong));
    z-index: 1;
  }
  sync-joiner .scan-stop:active {
    background-color: var(--scrim-strong);
  }
  sync-joiner .scan-stop svg {
    width: 18px;
    height: 18px;
  }
`
);
var TEMPLATE2 = (
  /* html */
  `
  <form class="joiner-form" autocomplete="off">
    <button class="joiner-btn" data-action="cancel" type="button" title="Cancel">
      <span class="joiner-btn-icon">${ICON_X2}</span>
    </button>
    <input class="joiner-input" type="text" placeholder="nostrpair://" spellcheck="false" autocorrect="off" autocapitalize="off" />
    <button class="joiner-btn" data-action="scan" type="button" title="Scan QR">${ICON_CAMERA}</button>
    <button class="joiner-btn" data-action="connect" type="submit" title="Connect">
      <span class="joiner-btn-icon">${ICON_CHECK2}</span>
    </button>
  </form>
  <div class="pair-panel">
    <span class="pair-label">Type the code shown on the other device:</span>
    <div class="pair-pin">
      <input class="pin-cell" type="text" inputmode="numeric" maxlength="1" pattern="\\d" autocomplete="off" aria-label="Digit 1" />
      <input class="pin-cell" type="text" inputmode="numeric" maxlength="1" pattern="\\d" autocomplete="off" aria-label="Digit 2" />
      <input class="pin-cell" type="text" inputmode="numeric" maxlength="1" pattern="\\d" autocomplete="off" aria-label="Digit 3" />
      <input class="pin-cell" type="text" inputmode="numeric" maxlength="1" pattern="\\d" autocomplete="off" aria-label="Digit 4" />
      <input class="pin-cell" type="text" inputmode="numeric" maxlength="1" pattern="\\d" autocomplete="off" aria-label="Digit 5" />
      <input class="pin-cell" type="text" inputmode="numeric" maxlength="1" pattern="\\d" autocomplete="off" aria-label="Digit 6" />
    </div>
    <span class="pair-status"></span>
  </div>
  <div class="scan-overlay">
    <div class="scan-video-wrap">
      <button class="scan-stop" type="button" title="Stop scanning">${ICON_X2}</button>
    </div>
  </div>
`
);
var SyncJoiner = class extends HTMLElement {
  #form;
  #input;
  #cancelBtn;
  #scanBtn;
  #connectBtn;
  #connectIcon;
  #pinWrap;
  #pinCells = [];
  #statusEl;
  #scanWrap;
  #scanStopBtn;
  #errorTimer = null;
  #pinErrorTimer = null;
  #busy = false;
  #session = null;
  #scanner = null;
  #intakeToken = null;
  #unsubscribeLocale = null;
  #statusKey = "";
  #statusValues;
  // Joiner derives its own pair code locally so we can verify the user's
  // typed digits before sending — saves a round-trip on user typos and
  // makes the channel's authenticity check happen entirely on this device.
  #expectedCode = null;
  // Wired by the parent sync-panel.
  list = null;
  toolbarButtons = [];
  onClosed = null;
  connectedCallback() {
    injectComponentStyles("sync-joiner", STYLES2);
    this.innerHTML = TEMPLATE2;
    this.#form = this.querySelector(".joiner-form");
    this.#input = this.querySelector(".joiner-input");
    this.#cancelBtn = this.querySelector('button[data-action="cancel"]');
    this.#scanBtn = this.querySelector('button[data-action="scan"]');
    this.#connectBtn = this.querySelector('button[data-action="connect"]');
    this.#connectIcon = this.#connectBtn.querySelector(".joiner-btn-icon");
    this.#pinWrap = this.querySelector(".pair-pin");
    this.#pinCells = Array.from(this.querySelectorAll(".pin-cell"));
    this.#statusEl = this.querySelector(".pair-status");
    this.#scanWrap = this.querySelector(".scan-video-wrap");
    this.#scanStopBtn = this.querySelector(".scan-stop");
    this.#form.addEventListener("submit", this.#onSubmit);
    this.#cancelBtn.addEventListener("click", this.#onCancel);
    this.#scanBtn.addEventListener("click", this.#onStartScan);
    this.#scanStopBtn.addEventListener("click", () => this.#stopScan());
    for (const cell of this.#pinCells) {
      cell.addEventListener("input", this.#onPinInput);
      cell.addEventListener("keydown", this.#onPinKeydown);
      cell.addEventListener("paste", this.#onPinPaste);
      cell.addEventListener("focus", () => cell.select());
    }
    this.#translate();
    this.#unsubscribeLocale = subscribeLocaleChanged(() => this.#translate());
    if (isCameraSupported()) this.dataset.camera = "true";
  }
  disconnectedCallback() {
    if (this.#errorTimer) clearTimeout(this.#errorTimer);
    if (this.#pinErrorTimer) clearTimeout(this.#pinErrorTimer);
    this.#stopScan();
    this.#session?.close();
    this.#unsubscribeLocale?.();
    this.#unsubscribeLocale = null;
  }
  open() {
    if (this.hasAttribute("open")) return;
    this.setAttribute("open", "");
    this.#setToolbarDisabled(true);
    requestAnimationFrame(() => this.#input?.focus());
  }
  close({ completed = false } = {}) {
    this.removeAttribute("open");
    this.#input.value = "";
    this.#clearErrorFlash();
    this.#stopScan();
    this.#tearDownPair();
    this.list?.exitSelectionMode();
    this.#setToolbarDisabled(false);
    this.onClosed?.({ completed });
  }
  #setToolbarDisabled(disabled) {
    for (const btn of this.toolbarButtons) {
      if (btn) btn.disabled = disabled;
    }
  }
  #onCancel = () => {
    if (this.#busy && this.#intakeToken) abortIntake(this.#intakeToken);
    this.close();
  };
  #onSubmit = async (e) => {
    e.preventDefault();
    if (this.#busy) return;
    const raw = this.#input.value.trim();
    if (!raw) return;
    if (!raw.startsWith("nostrpair://")) {
      info(t2("Paste a nostrpair:// URL or scan the QR shown by the other device."));
      this.#flashError();
      return;
    }
    await this.#startPair(raw);
  };
  async #startPair(url) {
    this.#setBusy(true);
    this.#setPinDisabled(false);
    this.dataset.pair = "active";
    this.#setStatus("Connecting\u2026", null);
    this.list?.enterSelectionMode();
    try {
      this.#session = new JoinerSession(url, {
        onConnected: () => this.#setStatus("Connected: exchanging trust\u2026", null),
        onPairingCode: (code) => {
          this.#expectedCode = code;
          this.#setPinDisabled(false);
          this.#setConnectPending(false);
          this.#setStatus("Type the code shown on the other device.", null);
          this.#pinCells[0]?.focus();
        },
        onError: (err) => {
          console.error("joiner session error", err?.message ?? err);
          this.#setStatus("Pairing channel error.", "error");
        }
      });
      await this.#session.connect();
    } catch (err) {
      this.#setBusy(false);
      console.error("joiner connect failed", err?.message ?? err);
      const { message, longMessage } = pairErrorToToast(err);
      error(t2(message), longMessage ? t2(longMessage) : "");
      this.#tearDownPair();
      this.list?.exitSelectionMode();
      return;
    }
    this.#setConnectPending(false);
  }
  #tearDownPair() {
    this.dataset.pair = "";
    this.#expectedCode = null;
    if (this.#pinErrorTimer) {
      clearTimeout(this.#pinErrorTimer);
      this.#pinErrorTimer = null;
    }
    this.#clearPin();
    this.#setPinDisabled(false);
    this.#pinWrap.classList.remove("is-error");
    this.#setStatus("", null);
    if (this.#session) {
      try {
        this.#session.close();
      } catch {
      }
      this.#session = null;
    }
    this.#setBusy(false);
  }
  #onPinInput = async (e) => {
    if (!this.#session) return;
    const cell = e.target;
    const clean = cell.value.replace(/\D/g, "").slice(-1);
    if (clean !== cell.value) cell.value = clean;
    if (clean) {
      const idx = this.#pinCells.indexOf(cell);
      if (idx < this.#pinCells.length - 1) this.#pinCells[idx + 1].focus();
    }
    await this.#tryPinSubmit();
  };
  #onPinKeydown = (e) => {
    const idx = this.#pinCells.indexOf(e.target);
    if (idx < 0) return;
    if (e.key === "Backspace") {
      if (!e.target.value && idx > 0) {
        e.preventDefault();
        this.#pinCells[idx - 1].value = "";
        this.#pinCells[idx - 1].focus();
      }
    } else if (e.key === "ArrowLeft" && idx > 0) {
      e.preventDefault();
      this.#pinCells[idx - 1].focus();
    } else if (e.key === "ArrowRight" && idx < this.#pinCells.length - 1) {
      e.preventDefault();
      this.#pinCells[idx + 1].focus();
    }
  };
  #onPinPaste = async (e) => {
    const text = (e.clipboardData?.getData("text") || "").replace(/\D/g, "").slice(0, 6);
    if (!text) return;
    e.preventDefault();
    for (let i = 0; i < this.#pinCells.length; i++) {
      this.#pinCells[i].value = text[i] || "";
    }
    const focusIdx = Math.min(text.length, this.#pinCells.length - 1);
    this.#pinCells[focusIdx].focus();
    await this.#tryPinSubmit();
  };
  #tryPinSubmit = async () => {
    if (!this.#session || !this.#expectedCode) return;
    const code = this.#pinCells.map((c) => c.value).join("");
    if (code.length < 6) return;
    if (code !== this.#expectedCode) {
      this.#flashPinError("Code mismatch: check the digits on the other device.");
      return;
    }
    if (this.#intakeToken) return;
    await this.#runExchange(code);
  };
  async #runExchange(code) {
    this.#setPinDisabled(true);
    const token = createIntakeToken();
    this.#intakeToken = token;
    this.#setStatus("Code matched: exchanging trust\u2026", null);
    try {
      if (!document.hasFocus()) {
        this.#setStatus("Switch back to this tab to continue\u2026", null);
        await waitForFocus((cancel) => token.cleanups.push(cancel));
        if (token.cancelled) throw new Error("IMPORT_CANCELLED");
      }
      await ensureRegistered();
      if (token.cancelled) throw new Error("IMPORT_CANCELLED");
      const ourSignerPubkey = await getDeviceSignerPubkey();
      const peer = await this.#session.exchangeTrust({
        platform: detectPlatform(),
        signerPubkey: ourSignerPubkey
      });
      if (token.cancelled) throw new Error("IMPORT_CANCELLED");
      const selectedPubkeys = this.list?.getSelectedPubkeys() ?? [];
      const accountsToSend = list().filter((a) => selectedPubkeys.includes(a.pubkey));
      let outgoing = { accounts: [] };
      if (accountsToSend.length) {
        const entries = await openSecrets();
        if (token.cancelled) throw new Error("IMPORT_CANCELLED");
        outgoing = buildSyncAccountPayload(accountsToSend, entries, {
          nsecFromHex,
          npubFromPubkey
        });
      }
      this.#setStatus("Sending accounts\u2026", null);
      const reply = await this.#session.exchangeAccounts({
        code,
        platform: detectPlatform(),
        accounts: outgoing.accounts
      });
      if (token.cancelled) throw new Error("IMPORT_CANCELLED");
      this.#setStatus(reply.accounts.length ? "Importing {{count}} accounts\u2026" : "Storing trust\u2026", null, { count: reply.accounts.length });
      const prepared = [];
      const errors = [];
      for (let i = reply.accounts.length - 1; i >= 0; i--) {
        if (token.cancelled) throw new Error("IMPORT_CANCELLED");
        try {
          const p = await prepareBareKey(reply.accounts[i], token);
          if (p.skipped) errors.push(p.reason);
          else prepared.push(p);
        } catch (err) {
          if (err?.message === "IMPORT_CANCELLED") throw err;
          errors.push(err?.message ?? String(err));
        }
      }
      if (token.cancelled) throw new Error("IMPORT_CANCELLED");
      await commitPrepared(prepared, {
        peerSigner: { pubkey: peer.signerPubkey, platform: peer.platform || reply.platform }
      });
      const summary = reply.accounts.length === 0 ? t2("Devices synced") : t2("Synced: imported {{count}} accounts", { count: prepared.length });
      if (errors.length) warning(t2("{{summary}} ({{count}} failed)", { summary, count: errors.length }), errors.join("\n"));
      else success(summary);
      this.#setStatus("Done.", "success");
      setTimeout(() => this.close({ completed: true }), 1200);
    } catch (err) {
      if (err?.message !== "IMPORT_CANCELLED") {
        console.error("joiner exchange failed", err?.message ?? err);
        const { message, longMessage } = pairErrorToToast(err);
        error(t2(message), longMessage ? t2(longMessage) : "");
        this.#setStatus("Error. Try again.", "error");
        this.#setPinDisabled(false);
      }
    } finally {
      if (this.#intakeToken === token) this.#intakeToken = null;
    }
  }
  #setPinDisabled(disabled) {
    for (const cell of this.#pinCells) cell.disabled = disabled;
  }
  #clearPin() {
    for (const cell of this.#pinCells) cell.value = "";
  }
  #flashPinError(msg) {
    this.#pinWrap.classList.add("is-error");
    this.#setStatus(msg, "error");
    if (this.#pinErrorTimer) clearTimeout(this.#pinErrorTimer);
    this.#pinErrorTimer = setTimeout(() => {
      this.#pinWrap.classList.remove("is-error");
      this.#clearPin();
      this.#pinCells[0]?.focus();
      this.#setStatus("Type the code shown on the other device.", null);
    }, ERROR_FLASH_MS);
  }
  #setBusy(on) {
    this.#busy = on;
    this.#input.disabled = on;
    this.#scanBtn.disabled = on;
    this.#connectBtn.disabled = on;
    this.#setConnectPending(on);
  }
  #setConnectPending(on) {
    this.#connectIcon.classList.toggle("pulsate", on);
  }
  #flashError() {
    this.#clearErrorFlash();
    this.#connectBtn.disabled = true;
    this.#connectBtn.classList.add("is-error");
    this.#connectIcon.innerHTML = ICON_ALERT;
    this.#errorTimer = setTimeout(() => this.#clearErrorFlash(), ERROR_FLASH_MS);
  }
  #clearErrorFlash() {
    if (this.#errorTimer) {
      clearTimeout(this.#errorTimer);
      this.#errorTimer = null;
    }
    this.#connectBtn.classList.remove("is-error");
    this.#connectIcon.innerHTML = ICON_CHECK2;
    if (!this.#busy) this.#connectBtn.disabled = false;
  }
  #setStatus(key, kind, values) {
    this.#statusKey = key;
    this.#statusValues = values;
    this.#statusEl.textContent = key ? t2(key, values) : "";
    this.#statusEl.classList.toggle("is-error", kind === "error");
    this.#statusEl.classList.toggle("is-success", kind === "success");
  }
  #translate() {
    if (!this.#cancelBtn) return;
    this.#cancelBtn.title = t2("Cancel");
    this.#scanBtn.title = t2("Scan QR");
    this.#connectBtn.title = t2("Connect");
    this.querySelector(".pair-label").textContent = t2("Type the code shown on the other device:");
    this.#pinCells.forEach((cell, index) => cell.setAttribute("aria-label", t2("Digit {{number}}", { number: index + 1 })));
    this.#scanStopBtn.title = t2("Stop scanning");
    if (this.#statusKey) this.#statusEl.textContent = t2(this.#statusKey, this.#statusValues);
  }
  #onStartScan = async () => {
    if (this.#scanner || this.#busy) return;
    this.#scanBtn.disabled = true;
    this.#scanBtn.classList.add("pulsate");
    const scanner = new QrScanner({
      onResult: (value) => {
        this.#stopScan();
        this.#input.value = value;
        this.#startPair(value.trim());
      },
      onError: (err) => console.warn("qr scan error", err?.message ?? err)
    });
    this.#scanWrap.appendChild(scanner.videoElement);
    scanner.videoElement.classList.add("scan-video");
    try {
      await scanner.start();
      this.#scanner = scanner;
      this.dataset.scanning = "true";
    } catch (err) {
      console.error("camera start failed", err?.message ?? err);
      error(t2("Could not start the camera"), err?.message ?? "");
      try {
        scanner.stop();
      } catch {
      }
      this.#removeScanVideo();
      this.#flashError();
    } finally {
      this.#scanBtn.disabled = false;
      this.#scanBtn.classList.remove("pulsate");
    }
  };
  #stopScan() {
    if (this.#scanner) {
      try {
        this.#scanner.stop();
      } catch {
      }
      this.#scanner = null;
    }
    this.#removeScanVideo();
    this.dataset.scanning = "";
  }
  #removeScanVideo() {
    const video = this.#scanWrap.querySelector("video");
    if (video) video.remove();
  }
};
function pairErrorToToast(err) {
  const code = err?.message ?? String(err);
  switch (code) {
    case "SYNC_TIMEOUT":
      return { message: "Pairing timed out", longMessage: "The other device did not respond in time." };
    case "SYNC_REJECTED":
      return { message: "Pairing rejected", longMessage: "The other device declined the request." };
    case "SYNC_BAD_RESPONSE":
      return { message: "Pairing failed", longMessage: "Got an unexpected response from the other device." };
    case "PAIRING_PUBLISH_FAILED":
    case "PAIRING_PUBLISH_TIMEOUT":
      return { message: "Pairing relay failed", longMessage: "The relay did not accept the pairing message. Try again, or generate a fresh pairing URL." };
    case "REGISTER_TRUSTED_SIGNER_FAILED":
      return { message: "Trust exchange failed", longMessage: "The other device could not store this device's signer key." };
    case "VAULT_LOCKED":
      return { message: "Pairing device locked", longMessage: "Unlock or create the passkey on the other device, then try pairing again." };
    case "invalid pairing code":
      return { message: "Code mismatch", longMessage: "Double-check the digits shown on the other device." };
    case "INVALID_NOSTRPAIR_URL":
      return { message: "Invalid pairing URL", longMessage: "" };
    default:
      return { message: "Sync failed", longMessage: code };
  }
}
customElements.define("sync-joiner", SyncJoiner);

// src/components/sync/sync-panel.js
var ICON_X3 = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6l-12 12" /><path d="M6 6l12 12" /></svg>';
var ICON_BULB = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h1m8 -9v1m8 8h1m-15.4 -6.4l.7 .7m12.1 -.7l-.7 .7" /><path d="M9 16a5 5 0 1 1 6 0a3.5 3.5 0 0 0 -1 3a2 2 0 0 1 -4 0a3.5 3.5 0 0 0 -1 -3" /><path d="M9.7 17l4.6 0" /></svg>';
var syncPanelLocales = defineLocales({
  Cancel: ["Annuler", "Annulla", "Abbrechen", "Cancelar", "Cancelar", "\u041E\u0442\u043C\u0435\u043D\u0430", "\u53D6\u6D88", "\u53D6\u6D88", "\u30AD\u30E3\u30F3\u30BB\u30EB", "\uCDE8\uC18C"],
  "Sync this device with another": ["Synchroniser cet appareil avec un autre", "Sincronizza questo dispositivo con un altro", "Dieses Ger\xE4t mit einem anderen synchronisieren", "Sincronizar este dispositivo con otro", "Sincronizar este dispositivo com outro", "\u0421\u0438\u043D\u0445\u0440\u043E\u043D\u0438\u0437\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u044D\u0442\u043E \u0443\u0441\u0442\u0440\u043E\u0439\u0441\u0442\u0432\u043E \u0441 \u0434\u0440\u0443\u0433\u0438\u043C", "\u5C06\u6B64\u8BBE\u5907\u4E0E\u53E6\u4E00\u53F0\u8BBE\u5907\u540C\u6B65", "\u5C07\u6B64\u88DD\u7F6E\u8207\u53E6\u4E00\u53F0\u88DD\u7F6E\u540C\u6B65", "\u3053\u306E\u30C7\u30D0\u30A4\u30B9\u3092\u5225\u306E\u30C7\u30D0\u30A4\u30B9\u3068\u540C\u671F", "\uC774 \uAE30\uAE30\uB97C \uB2E4\uB978 \uAE30\uAE30\uC640 \uB3D9\uAE30\uD654"],
  "Click each button on a different device or browser.": ["Cliquez sur chaque bouton sur un appareil ou navigateur diff\xE9rent.", "Fai clic su ciascun pulsante su un dispositivo o browser diverso.", "Klicke jede Schaltfl\xE4che auf einem anderen Ger\xE4t oder Browser an.", "Pulsa cada bot\xF3n en un dispositivo o navegador diferente.", "Clique em cada bot\xE3o em um dispositivo ou navegador diferente.", "\u041D\u0430\u0436\u043C\u0438\u0442\u0435 \u043A\u0430\u0436\u0434\u0443\u044E \u043A\u043D\u043E\u043F\u043A\u0443 \u043D\u0430 \u0434\u0440\u0443\u0433\u043E\u043C \u0443\u0441\u0442\u0440\u043E\u0439\u0441\u0442\u0432\u0435 \u0438\u043B\u0438 \u0432 \u0434\u0440\u0443\u0433\u043E\u043C \u0431\u0440\u0430\u0443\u0437\u0435\u0440\u0435.", "\u8BF7\u5728\u4E0D\u540C\u8BBE\u5907\u6216\u6D4F\u89C8\u5668\u4E0A\u5206\u522B\u70B9\u51FB\u6BCF\u4E2A\u6309\u94AE\u3002", "\u8ACB\u5728\u4E0D\u540C\u88DD\u7F6E\u6216\u700F\u89BD\u5668\u4E0A\u5206\u5225\u9EDE\u64CA\u6BCF\u500B\u6309\u9215\u3002", "\u305D\u308C\u305E\u308C\u306E\u30DC\u30BF\u30F3\u3092\u5225\u306E\u30C7\u30D0\u30A4\u30B9\u307E\u305F\u306F\u30D6\u30E9\u30A6\u30B6\u3067\u62BC\u3057\u3066\u304F\u3060\u3055\u3044\u3002", "\uAC01 \uBC84\uD2BC\uC744 \uC11C\uB85C \uB2E4\uB978 \uAE30\uAE30\uB098 \uBE0C\uB77C\uC6B0\uC800\uC5D0\uC11C \uB204\uB974\uC138\uC694."],
  "Device One": ["Appareil un", "Dispositivo uno", "Ger\xE4t eins", "Dispositivo uno", "Dispositivo um", "\u0423\u0441\u0442\u0440\u043E\u0439\u0441\u0442\u0432\u043E \u043E\u0434\u0438\u043D", "\u8BBE\u5907\u4E00", "\u88DD\u7F6E\u4E00", "\u30C7\u30D0\u30A4\u30B9 1", "\uAE30\uAE30 1"],
  "Device Two": ["Appareil deux", "Dispositivo due", "Ger\xE4t zwei", "Dispositivo dos", "Dispositivo dois", "\u0423\u0441\u0442\u0440\u043E\u0439\u0441\u0442\u0432\u043E \u0434\u0432\u0430", "\u8BBE\u5907\u4E8C", "\u88DD\u7F6E\u4E8C", "\u30C7\u30D0\u30A4\u30B9 2", "\uAE30\uAE30 2"]
});
var t3 = getT(syncPanelLocales);
var STYLES3 = (
  /* css */
  `
  sync-panel {
    display: block;
    overflow: hidden;
    max-height: 0;
    transition: max-height 280ms ease-out;
  }
  /* Picker (hint + two device buttons) is short. Once a device flow opens
     we let its internal max-height drive the height \u2014 the picker's max
     is roughly the bulb hint + button row + paddings. */
  sync-panel[open] {
    max-height: 200px;
  }
  /* When one of the inner flows is showing instead of the picker, drop the
     panel-level cap entirely so the inner flow's own transitions own the
     animation. */
  sync-panel[open][data-flow] {
    max-height: 800px;
  }
  sync-panel .panel-wrap {
    padding-top: 12px;
  }
  sync-panel .panel-header {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  sync-panel .panel-title {
    font-size: 14rem;
    font-weight: 600;
    color: var(--fg-strong);
  }
  sync-panel .panel-cancel {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background-color: var(--surface-interactive);
    color: var(--fg-strong);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  sync-panel .panel-cancel:active {
    background-color: var(--surface-interactive-active);
  }
  sync-panel .panel-cancel svg {
    width: 16px;
    height: 16px;
  }
  sync-panel .panel-hint {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    background-color: var(--surface);
    border-radius: 4px;
    border-left: 3px solid var(--warning-fg);
    font-size: 13rem;
    color: var(--fg);
    line-height: 1.35;
  }
  sync-panel .panel-hint .hint-icon {
    flex-shrink: 0;
    color: var(--warning-fg);
    position: relative;
    bottom: 2px;
  }
  sync-panel .panel-hint .hint-icon svg {
    width: 18px;
    height: 18px;
    display: block;
  }
  sync-panel .device-buttons {
    display: flex;
    gap: 10px;
  }
  sync-panel .device-btn {
    flex: 1 1 0;
    min-width: 0;
    background-color: var(--accent);
    color: var(--fg-on-accent);
    border-radius: 8px;
    padding: 10px 8px;
    font-size: 14rem;
    text-align: center;
  }
  sync-panel .device-btn:active {
    background-color: var(--accent-hover);
  }
  /* Mirror the toolbar "on" state for the two device buttons \u2014 whichever
     flow (host / joiner) is open marks its button is-active and disables
     the sibling, so the user can see which device flow is running. */
  sync-panel .device-btn.is-active {
    background-color: var(--accent-active);
    box-shadow: inset 0 2px 4px var(--shadow);
  }
  sync-panel .device-btn:disabled {
    opacity: 0.45;
  }
  sync-panel .panel-picker {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  /* While one of the device flows is open, we could hide the picker so the inner
     panel takes the slot. Th */
  sync-panel[data-flow] .panel-picker {
    /* display: none; */
  }
  sync-panel:not([data-flow]) sync-host,
  sync-panel:not([data-flow]) sync-joiner {
    display: none;
  }
`
);
var TEMPLATE3 = (
  /* html */
  `
  <div class="panel-wrap">
    <div class="panel-picker">
      <div class="panel-header">
        <button class="panel-cancel" type="button" title="Cancel">${ICON_X3}</button>
        <span class="panel-title">Sync this device with another</span>
      </div>
      <div class="panel-hint">
        <span class="hint-icon">${ICON_BULB}</span>
        <span>Click each button on a different device or browser.</span>
      </div>
      <div class="device-buttons">
        <button class="device-btn" type="button" data-device="host">Device One</button>
        <button class="device-btn" type="button" data-device="joiner">Device Two</button>
      </div>
    </div>
    <sync-host></sync-host>
    <sync-joiner></sync-joiner>
  </div>
`
);
var SyncPanel = class extends HTMLElement {
  #cancelBtn;
  #hostBtn;
  #joinerBtn;
  #host;
  #joiner;
  #unsubscribeLocale = null;
  // Wired by index.js. `toolbarButtons` are the *sibling* toolbar buttons
  // we grey out while sync is the active flow; `activeButton` is sync's
  // own toolbar button which we flip to .is-active so the user can tell
  // which feature owns the screen (no client-side router → no URL cue).
  // `list` is the account-list the inner flows drive into selection mode.
  list = null;
  toolbarButtons = [];
  activeButton = null;
  connectedCallback() {
    injectComponentStyles("sync-panel", STYLES3);
    this.innerHTML = TEMPLATE3;
    this.#cancelBtn = this.querySelector(".panel-cancel");
    this.#hostBtn = this.querySelector('button[data-device="host"]');
    this.#joinerBtn = this.querySelector('button[data-device="joiner"]');
    this.#host = this.querySelector("sync-host");
    this.#joiner = this.querySelector("sync-joiner");
    this.#cancelBtn.addEventListener("click", () => this.close());
    this.#hostBtn.addEventListener("click", () => {
      if (this.#hostBtn.classList.contains("is-active")) {
        this.#host.querySelector(".host-cancel")?.click();
      } else {
        this.#openFlow("host");
      }
    });
    this.#joinerBtn.addEventListener("click", () => {
      if (this.#joinerBtn.classList.contains("is-active")) {
        this.#joiner.querySelector('button[data-action="cancel"]')?.click();
      } else {
        this.#openFlow("joiner");
      }
    });
    this.#host.onClosed = (detail) => this.#onFlowClosed("host", detail);
    this.#joiner.onClosed = (detail) => this.#onFlowClosed("joiner", detail);
    this.#translate();
    this.#unsubscribeLocale = subscribeLocaleChanged(() => this.#translate());
  }
  disconnectedCallback() {
    this.#unsubscribeLocale?.();
    this.#unsubscribeLocale = null;
  }
  open() {
    if (this.hasAttribute("open")) return;
    this.setAttribute("open", "");
    this.#setToolbarDisabled(true);
    this.activeButton?.classList.add("is-active");
  }
  close() {
    if (!this.hasAttribute("open")) return;
    if (this.dataset.flow === "host") this.#host.close();
    else if (this.dataset.flow === "joiner") this.#joiner.close();
    this.removeAttribute("open");
    this.dataset.flow = "";
    this.#applyDeviceButtonState(null);
    this.#setToolbarDisabled(false);
    this.activeButton?.classList.remove("is-active");
  }
  #setToolbarDisabled(disabled) {
    for (const btn of this.toolbarButtons) {
      if (btn) btn.disabled = disabled;
    }
  }
  #applyDeviceButtonState(active) {
    this.#hostBtn.classList.toggle("is-active", active === "host");
    this.#joinerBtn.classList.toggle("is-active", active === "joiner");
    this.#hostBtn.disabled = active === "joiner";
    this.#joinerBtn.disabled = active === "host";
  }
  #openFlow(which) {
    if (this.dataset.flow) return;
    this.dataset.flow = which;
    this.#applyDeviceButtonState(which);
    if (which === "host") {
      this.#host.list = this.list;
      this.#host.toolbarButtons = [];
      this.#host.open();
    } else {
      this.#joiner.list = this.list;
      this.#joiner.toolbarButtons = [];
      this.#joiner.open();
    }
  }
  #onFlowClosed(which, detail = {}) {
    if (this.dataset.flow === which) {
      if (detail.completed) {
        this.close();
        return;
      }
      this.dataset.flow = "";
      this.#applyDeviceButtonState(null);
    }
  }
  #translate() {
    if (!this.#cancelBtn) return;
    this.#cancelBtn.title = t3("Cancel");
    this.querySelector(".panel-title").textContent = t3("Sync this device with another");
    this.querySelector(".panel-hint span:last-child").textContent = t3("Click each button on a different device or browser.");
    this.#hostBtn.textContent = t3("Device One");
    this.#joinerBtn.textContent = t3("Device Two");
  }
};
customElements.define("sync-panel", SyncPanel);
export {
  SyncPanel,
  syncPanelLocales
};
