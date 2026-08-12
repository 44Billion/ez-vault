// node_modules/@dicebear/core/lib/Error/ValidationError.js
var ValidationError = class extends Error {
  constructor(prefix, details) {
    const parts = [];
    for (const detail of details) {
      const segments = [];
      if (detail.instancePath) {
        segments.push(detail.instancePath);
      }
      if (detail.message) {
        segments.push(detail.message);
      }
      parts.push(segments.join(" "));
    }
    super(`${prefix}: ${parts.join(", ")}`);
    this.name = "ValidationError";
    this.details = details;
  }
};

// node_modules/@dicebear/core/lib/Error/StyleValidationError.js
var StyleValidationError = class extends ValidationError {
  constructor(details) {
    super("Invalid style definition", details);
    this.name = "StyleValidationError";
  }
};

// node_modules/@dicebear/core/lib/Validator/StyleValidator.js
function ucs2length(str) {
  let n = 0;
  for (const _ of str)
    n++;
  return n;
}
var func2 = ucs2length;
var pattern0 = new RegExp("^https?://", "u");
var pattern10 = new RegExp("^[a-z][a-zA-Z0-9]*$", "u");
var pattern36 = new RegExp("^#([a-fA-F0-9]{3}|[a-fA-F0-9]{4}|[a-fA-F0-9]{6}|[a-fA-F0-9]{8})$", "u");
var schema15 = { "description": "A map of allowed SVG presentation attributes. Only a safe subset is permitted; event handlers (e.g. `onclick`) and namespace attributes (e.g. `xlink:href`) are not allowed.", "type": "object", "properties": { "alignment-baseline": { "$ref": "#/definitions/attributeString" }, "amplitude": { "$ref": "#/definitions/attributeString" }, "azimuth": { "$ref": "#/definitions/attributeString" }, "baseFrequency": { "$ref": "#/definitions/attributeString" }, "baseline-shift": { "$ref": "#/definitions/attributeString" }, "bias": { "$ref": "#/definitions/attributeString" }, "class": { "$ref": "#/definitions/attributeString" }, "clipPathUnits": { "$ref": "#/definitions/attributeString" }, "clip-path": { "$ref": "#/definitions/attributeString" }, "clip-rule": { "$ref": "#/definitions/attributeString" }, "color": { "$ref": "#/definitions/colorValue" }, "color-interpolation": { "$ref": "#/definitions/attributeString" }, "color-interpolation-filters": { "$ref": "#/definitions/attributeString" }, "crossorigin": { "$ref": "#/definitions/attributeString" }, "cx": { "$ref": "#/definitions/attributeString" }, "cy": { "$ref": "#/definitions/attributeString" }, "d": { "$ref": "#/definitions/pathDataString" }, "decoding": { "$ref": "#/definitions/attributeString" }, "diffuseConstant": { "$ref": "#/definitions/attributeString" }, "direction": { "$ref": "#/definitions/attributeString" }, "display": { "$ref": "#/definitions/attributeString" }, "divisor": { "$ref": "#/definitions/attributeString" }, "dominant-baseline": { "$ref": "#/definitions/attributeString" }, "dx": { "$ref": "#/definitions/attributeString" }, "dy": { "$ref": "#/definitions/attributeString" }, "edgeMode": { "$ref": "#/definitions/attributeString" }, "elevation": { "$ref": "#/definitions/attributeString" }, "exponent": { "$ref": "#/definitions/attributeString" }, "fill": { "$ref": "#/definitions/colorValue" }, "fill-opacity": { "$ref": "#/definitions/attributeString" }, "fill-rule": { "$ref": "#/definitions/attributeString" }, "filter": { "$ref": "#/definitions/attributeString" }, "filterUnits": { "$ref": "#/definitions/attributeString" }, "flood-color": { "$ref": "#/definitions/colorValue" }, "flood-opacity": { "$ref": "#/definitions/attributeString" }, "font-family": { "anyOf": [{ "$ref": "#/definitions/attributeString" }, { "type": "object", "properties": { "type": { "const": "variable" }, "name": { "const": "fontFamily" } }, "required": ["type", "name"], "additionalProperties": false }] }, "font-size": { "$ref": "#/definitions/attributeString" }, "font-size-adjust": { "$ref": "#/definitions/attributeString" }, "font-style": { "$ref": "#/definitions/attributeString" }, "font-variant": { "$ref": "#/definitions/attributeString" }, "font-weight": { "anyOf": [{ "$ref": "#/definitions/attributeString" }, { "type": "object", "properties": { "type": { "const": "variable" }, "name": { "const": "fontWeight" } }, "required": ["type", "name"], "additionalProperties": false }] }, "fx": { "$ref": "#/definitions/attributeString" }, "fy": { "$ref": "#/definitions/attributeString" }, "gradientTransform": { "$ref": "#/definitions/attributeString" }, "gradientUnits": { "$ref": "#/definitions/attributeString" }, "height": { "$ref": "#/definitions/attributeString" }, "href": { "anyOf": [{ "type": "string", "pattern": "^#[a-zA-Z_][a-zA-Z0-9_.-]*$", "maxLength": 128 }, { "type": "string", "pattern": "^data:image/(png|gif|jpeg|webp|avif);base64,[a-zA-Z0-9+/=]+$", "maxLength": 262144 }] }, "id": { "$ref": "#/definitions/attributeString" }, "image-rendering": { "$ref": "#/definitions/attributeString" }, "in": { "$ref": "#/definitions/attributeString" }, "in2": { "$ref": "#/definitions/attributeString" }, "intercept": { "$ref": "#/definitions/attributeString" }, "k1": { "$ref": "#/definitions/attributeString" }, "k2": { "$ref": "#/definitions/attributeString" }, "k3": { "$ref": "#/definitions/attributeString" }, "k4": { "$ref": "#/definitions/attributeString" }, "kernelMatrix": { "$ref": "#/definitions/attributeString" }, "kernelUnitLength": { "$ref": "#/definitions/attributeString" }, "lang": { "$ref": "#/definitions/attributeString" }, "lengthAdjust": { "$ref": "#/definitions/attributeString" }, "letter-spacing": { "$ref": "#/definitions/attributeString" }, "lighting-color": { "$ref": "#/definitions/colorValue" }, "marker-end": { "$ref": "#/definitions/attributeString" }, "marker-mid": { "$ref": "#/definitions/attributeString" }, "marker-start": { "$ref": "#/definitions/attributeString" }, "markerHeight": { "$ref": "#/definitions/attributeString" }, "markerUnits": { "$ref": "#/definitions/attributeString" }, "markerWidth": { "$ref": "#/definitions/attributeString" }, "mask": { "$ref": "#/definitions/attributeString" }, "maskContentUnits": { "$ref": "#/definitions/attributeString" }, "maskUnits": { "$ref": "#/definitions/attributeString" }, "media": { "$ref": "#/definitions/attributeString" }, "method": { "$ref": "#/definitions/attributeString" }, "mode": { "$ref": "#/definitions/attributeString" }, "numOctaves": { "$ref": "#/definitions/attributeString" }, "offset": { "$ref": "#/definitions/attributeString" }, "opacity": { "$ref": "#/definitions/attributeString" }, "operator": { "$ref": "#/definitions/attributeString" }, "order": { "$ref": "#/definitions/attributeString" }, "orient": { "$ref": "#/definitions/attributeString" }, "overflow": { "$ref": "#/definitions/attributeString" }, "paint-order": { "$ref": "#/definitions/attributeString" }, "path": { "$ref": "#/definitions/attributeString" }, "pathLength": { "$ref": "#/definitions/attributeString" }, "patternContentUnits": { "$ref": "#/definitions/attributeString" }, "patternTransform": { "$ref": "#/definitions/attributeString" }, "patternUnits": { "$ref": "#/definitions/attributeString" }, "points": { "$ref": "#/definitions/attributeString" }, "preserveAlpha": { "$ref": "#/definitions/attributeString" }, "preserveAspectRatio": { "$ref": "#/definitions/attributeString" }, "primitiveUnits": { "$ref": "#/definitions/attributeString" }, "r": { "$ref": "#/definitions/attributeString" }, "radius": { "$ref": "#/definitions/attributeString" }, "refX": { "$ref": "#/definitions/attributeString" }, "refY": { "$ref": "#/definitions/attributeString" }, "result": { "$ref": "#/definitions/attributeString" }, "rx": { "$ref": "#/definitions/attributeString" }, "ry": { "$ref": "#/definitions/attributeString" }, "scale": { "$ref": "#/definitions/attributeString" }, "seed": { "$ref": "#/definitions/attributeString" }, "shape-rendering": { "$ref": "#/definitions/attributeString" }, "slope": { "$ref": "#/definitions/attributeString" }, "specularConstant": { "$ref": "#/definitions/attributeString" }, "specularExponent": { "$ref": "#/definitions/attributeString" }, "spreadMethod": { "$ref": "#/definitions/attributeString" }, "startOffset": { "$ref": "#/definitions/attributeString" }, "stdDeviation": { "$ref": "#/definitions/attributeString" }, "stitchTiles": { "$ref": "#/definitions/attributeString" }, "stop-color": { "$ref": "#/definitions/colorValue" }, "stop-opacity": { "$ref": "#/definitions/attributeString" }, "stroke": { "$ref": "#/definitions/colorValue" }, "stroke-dasharray": { "$ref": "#/definitions/attributeString" }, "stroke-dashoffset": { "$ref": "#/definitions/attributeString" }, "stroke-linecap": { "$ref": "#/definitions/attributeString" }, "stroke-linejoin": { "$ref": "#/definitions/attributeString" }, "stroke-miterlimit": { "$ref": "#/definitions/attributeString" }, "stroke-opacity": { "$ref": "#/definitions/attributeString" }, "stroke-width": { "$ref": "#/definitions/attributeString" }, "style": { "$ref": "#/definitions/cssString" }, "surfaceScale": { "$ref": "#/definitions/attributeString" }, "systemLanguage": { "$ref": "#/definitions/attributeString" }, "tabindex": { "$ref": "#/definitions/attributeString" }, "tableValues": { "$ref": "#/definitions/attributeString" }, "targetX": { "$ref": "#/definitions/attributeString" }, "targetY": { "$ref": "#/definitions/attributeString" }, "text-anchor": { "$ref": "#/definitions/attributeString" }, "text-decoration": { "$ref": "#/definitions/attributeString" }, "text-rendering": { "$ref": "#/definitions/attributeString" }, "textLength": { "$ref": "#/definitions/attributeString" }, "transform": { "$ref": "#/definitions/attributeString" }, "transform-origin": { "$ref": "#/definitions/attributeString" }, "type": { "$ref": "#/definitions/attributeString" }, "values": { "$ref": "#/definitions/attributeString" }, "viewBox": { "$ref": "#/definitions/attributeString" }, "visibility": { "$ref": "#/definitions/attributeString" }, "width": { "$ref": "#/definitions/attributeString" }, "word-spacing": { "$ref": "#/definitions/attributeString" }, "writing-mode": { "$ref": "#/definitions/attributeString" }, "x": { "$ref": "#/definitions/attributeString" }, "x1": { "$ref": "#/definitions/attributeString" }, "x2": { "$ref": "#/definitions/attributeString" }, "xChannelSelector": { "$ref": "#/definitions/attributeString" }, "y": { "$ref": "#/definitions/attributeString" }, "y1": { "$ref": "#/definitions/attributeString" }, "y2": { "$ref": "#/definitions/attributeString" }, "yChannelSelector": { "$ref": "#/definitions/attributeString" }, "z": { "$ref": "#/definitions/attributeString" } }, "additionalProperties": false };
var func12 = Object.prototype.hasOwnProperty;
var pattern3 = new RegExp("[uU][rR][lL]\\s*\\(\\s*[^#)\\s]", "u");
var pattern4 = new RegExp("[eE][xX][pP][rR][eE][sS][sS][iI][oO][nN]\\s*\\(", "u");
var pattern5 = new RegExp("[bB][eE][hH][aA][vV][iI][oO][rR]\\s*:", "u");
var pattern6 = new RegExp("-[mM][oO][zZ]-[bB][iI][nN][dD][iI][nN][gG]", "u");
var pattern7 = new RegExp("[jJ][aA][vV][aA][sS][cC][rR][iI][pP][tT]\\s*:", "u");
var pattern8 = new RegExp("[vV][bB][sS][cC][rR][iI][pP][tT]\\s*:", "u");
var pattern9 = new RegExp("\\\\", "u");
function validate12(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  const _errs2 = errors;
  const _errs4 = errors;
  const _errs5 = errors;
  if (typeof data !== "string") {
    const err0 = {};
    if (vErrors === null) {
      vErrors = [err0];
    } else {
      vErrors.push(err0);
    }
    errors++;
  }
  const _errs7 = errors;
  let valid3 = false;
  const _errs8 = errors;
  if (errors === _errs8) {
    if (typeof data === "string") {
      if (!pattern3.test(data)) {
        const err1 = {};
        if (vErrors === null) {
          vErrors = [err1];
        } else {
          vErrors.push(err1);
        }
        errors++;
      }
    } else {
      const err2 = {};
      if (vErrors === null) {
        vErrors = [err2];
      } else {
        vErrors.push(err2);
      }
      errors++;
    }
  }
  var _valid0 = _errs8 === errors;
  valid3 = valid3 || _valid0;
  if (!valid3) {
    const _errs10 = errors;
    if (errors === _errs10) {
      if (typeof data === "string") {
        if (!pattern4.test(data)) {
          const err3 = {};
          if (vErrors === null) {
            vErrors = [err3];
          } else {
            vErrors.push(err3);
          }
          errors++;
        }
      } else {
        const err4 = {};
        if (vErrors === null) {
          vErrors = [err4];
        } else {
          vErrors.push(err4);
        }
        errors++;
      }
    }
    var _valid0 = _errs10 === errors;
    valid3 = valid3 || _valid0;
    if (!valid3) {
      const _errs12 = errors;
      if (errors === _errs12) {
        if (typeof data === "string") {
          if (!pattern5.test(data)) {
            const err5 = {};
            if (vErrors === null) {
              vErrors = [err5];
            } else {
              vErrors.push(err5);
            }
            errors++;
          }
        } else {
          const err6 = {};
          if (vErrors === null) {
            vErrors = [err6];
          } else {
            vErrors.push(err6);
          }
          errors++;
        }
      }
      var _valid0 = _errs12 === errors;
      valid3 = valid3 || _valid0;
      if (!valid3) {
        const _errs14 = errors;
        if (errors === _errs14) {
          if (typeof data === "string") {
            if (!pattern6.test(data)) {
              const err7 = {};
              if (vErrors === null) {
                vErrors = [err7];
              } else {
                vErrors.push(err7);
              }
              errors++;
            }
          } else {
            const err8 = {};
            if (vErrors === null) {
              vErrors = [err8];
            } else {
              vErrors.push(err8);
            }
            errors++;
          }
        }
        var _valid0 = _errs14 === errors;
        valid3 = valid3 || _valid0;
        if (!valid3) {
          const _errs16 = errors;
          if (errors === _errs16) {
            if (typeof data === "string") {
              if (!pattern7.test(data)) {
                const err9 = {};
                if (vErrors === null) {
                  vErrors = [err9];
                } else {
                  vErrors.push(err9);
                }
                errors++;
              }
            } else {
              const err10 = {};
              if (vErrors === null) {
                vErrors = [err10];
              } else {
                vErrors.push(err10);
              }
              errors++;
            }
          }
          var _valid0 = _errs16 === errors;
          valid3 = valid3 || _valid0;
          if (!valid3) {
            const _errs18 = errors;
            if (errors === _errs18) {
              if (typeof data === "string") {
                if (!pattern8.test(data)) {
                  const err11 = {};
                  if (vErrors === null) {
                    vErrors = [err11];
                  } else {
                    vErrors.push(err11);
                  }
                  errors++;
                }
              } else {
                const err12 = {};
                if (vErrors === null) {
                  vErrors = [err12];
                } else {
                  vErrors.push(err12);
                }
                errors++;
              }
            }
            var _valid0 = _errs18 === errors;
            valid3 = valid3 || _valid0;
            if (!valid3) {
              const _errs20 = errors;
              if (errors === _errs20) {
                if (typeof data === "string") {
                  if (!pattern9.test(data)) {
                    const err13 = {};
                    if (vErrors === null) {
                      vErrors = [err13];
                    } else {
                      vErrors.push(err13);
                    }
                    errors++;
                  }
                } else {
                  const err14 = {};
                  if (vErrors === null) {
                    vErrors = [err14];
                  } else {
                    vErrors.push(err14);
                  }
                  errors++;
                }
              }
              var _valid0 = _errs20 === errors;
              valid3 = valid3 || _valid0;
            }
          }
        }
      }
    }
  }
  if (!valid3) {
    const err15 = {};
    if (vErrors === null) {
      vErrors = [err15];
    } else {
      vErrors.push(err15);
    }
    errors++;
  } else {
    errors = _errs7;
    if (vErrors !== null) {
      if (_errs7) {
        vErrors.length = _errs7;
      } else {
        vErrors = null;
      }
    }
  }
  var valid2 = _errs5 === errors;
  if (valid2) {
    validate12.errors = [{ instancePath, schemaPath: "#/definitions/filteredString/not", keyword: "not", params: {}, message: "must NOT be valid" }];
    return false;
  } else {
    errors = _errs4;
    if (vErrors !== null) {
      if (_errs4) {
        vErrors.length = _errs4;
      } else {
        vErrors = null;
      }
    }
  }
  if (errors === _errs2) {
    if (typeof data === "string") {
      if (func2(data) > 16384) {
        validate12.errors = [{ instancePath, schemaPath: "#/definitions/filteredString/maxLength", keyword: "maxLength", params: { limit: 16384 }, message: "must NOT have more than 16384 characters" }];
        return false;
      }
    } else {
      validate12.errors = [{ instancePath, schemaPath: "#/definitions/filteredString/type", keyword: "type", params: { type: "string" }, message: "must be string" }];
      return false;
    }
  }
  if (errors === 0) {
    if (typeof data === "string") {
      if (func2(data) > 1024) {
        validate12.errors = [{ instancePath, schemaPath: "#/maxLength", keyword: "maxLength", params: { limit: 1024 }, message: "must NOT have more than 1024 characters" }];
        return false;
      }
    } else {
      validate12.errors = [{ instancePath, schemaPath: "#/type", keyword: "type", params: { type: "string" }, message: "must be string" }];
      return false;
    }
  }
  validate12.errors = vErrors;
  return errors === 0;
}
function validate25(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  const _errs1 = errors;
  if (errors === _errs1) {
    if (typeof data === "string") {
      if (func2(data) > 64) {
        validate25.errors = [{ instancePath, schemaPath: "#/definitions/camelCaseName/maxLength", keyword: "maxLength", params: { limit: 64 }, message: "must NOT have more than 64 characters" }];
        return false;
      } else {
        if (!pattern10.test(data)) {
          validate25.errors = [{ instancePath, schemaPath: "#/definitions/camelCaseName/pattern", keyword: "pattern", params: { pattern: "^[a-z][a-zA-Z0-9]*$" }, message: 'must match pattern "^[a-z][a-zA-Z0-9]*$"' }];
          return false;
        }
      }
    } else {
      validate25.errors = [{ instancePath, schemaPath: "#/definitions/camelCaseName/type", keyword: "type", params: { type: "string" }, message: "must be string" }];
      return false;
    }
  }
  validate25.errors = vErrors;
  return errors === 0;
}
function validate23(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  const _errs0 = errors;
  let valid0 = false;
  const _errs1 = errors;
  if (!validate12(data, { instancePath, parentData, parentDataProperty, rootData })) {
    vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
    errors = vErrors.length;
  }
  var _valid0 = _errs1 === errors;
  valid0 = valid0 || _valid0;
  if (!valid0) {
    const _errs2 = errors;
    if (errors === _errs2) {
      if (data && typeof data == "object" && !Array.isArray(data)) {
        let missing0;
        if (data.type === void 0 && (missing0 = "type") || data.name === void 0 && (missing0 = "name")) {
          const err0 = { instancePath, schemaPath: "#/anyOf/1/required", keyword: "required", params: { missingProperty: missing0 }, message: "must have required property '" + missing0 + "'" };
          if (vErrors === null) {
            vErrors = [err0];
          } else {
            vErrors.push(err0);
          }
          errors++;
        } else {
          const _errs4 = errors;
          for (const key0 in data) {
            if (!(key0 === "type" || key0 === "name")) {
              const err1 = { instancePath, schemaPath: "#/anyOf/1/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
              if (vErrors === null) {
                vErrors = [err1];
              } else {
                vErrors.push(err1);
              }
              errors++;
              break;
            }
          }
          if (_errs4 === errors) {
            if (data.type !== void 0) {
              const _errs5 = errors;
              if ("color" !== data.type) {
                const err2 = { instancePath: instancePath + "/type", schemaPath: "#/anyOf/1/properties/type/const", keyword: "const", params: { allowedValue: "color" }, message: "must be equal to constant" };
                if (vErrors === null) {
                  vErrors = [err2];
                } else {
                  vErrors.push(err2);
                }
                errors++;
              }
              var valid1 = _errs5 === errors;
            } else {
              var valid1 = true;
            }
            if (valid1) {
              if (data.name !== void 0) {
                const _errs6 = errors;
                if (!validate25(data.name, { instancePath: instancePath + "/name", parentData: data, parentDataProperty: "name", rootData })) {
                  vErrors = vErrors === null ? validate25.errors : vErrors.concat(validate25.errors);
                  errors = vErrors.length;
                }
                var valid1 = _errs6 === errors;
              } else {
                var valid1 = true;
              }
            }
          }
        }
      } else {
        const err3 = { instancePath, schemaPath: "#/anyOf/1/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err3];
        } else {
          vErrors.push(err3);
        }
        errors++;
      }
    }
    var _valid0 = _errs2 === errors;
    valid0 = valid0 || _valid0;
  }
  if (!valid0) {
    const err4 = { instancePath, schemaPath: "#/anyOf", keyword: "anyOf", params: {}, message: "must match a schema in anyOf" };
    if (vErrors === null) {
      vErrors = [err4];
    } else {
      vErrors.push(err4);
    }
    errors++;
    validate23.errors = vErrors;
    return false;
  } else {
    errors = _errs0;
    if (vErrors !== null) {
      if (_errs0) {
        vErrors.length = _errs0;
      } else {
        vErrors = null;
      }
    }
  }
  validate23.errors = vErrors;
  return errors === 0;
}
function validate33(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  const _errs2 = errors;
  const _errs4 = errors;
  const _errs5 = errors;
  if (typeof data !== "string") {
    const err0 = {};
    if (vErrors === null) {
      vErrors = [err0];
    } else {
      vErrors.push(err0);
    }
    errors++;
  }
  const _errs7 = errors;
  let valid3 = false;
  const _errs8 = errors;
  if (errors === _errs8) {
    if (typeof data === "string") {
      if (!pattern3.test(data)) {
        const err1 = {};
        if (vErrors === null) {
          vErrors = [err1];
        } else {
          vErrors.push(err1);
        }
        errors++;
      }
    } else {
      const err2 = {};
      if (vErrors === null) {
        vErrors = [err2];
      } else {
        vErrors.push(err2);
      }
      errors++;
    }
  }
  var _valid0 = _errs8 === errors;
  valid3 = valid3 || _valid0;
  if (!valid3) {
    const _errs10 = errors;
    if (errors === _errs10) {
      if (typeof data === "string") {
        if (!pattern4.test(data)) {
          const err3 = {};
          if (vErrors === null) {
            vErrors = [err3];
          } else {
            vErrors.push(err3);
          }
          errors++;
        }
      } else {
        const err4 = {};
        if (vErrors === null) {
          vErrors = [err4];
        } else {
          vErrors.push(err4);
        }
        errors++;
      }
    }
    var _valid0 = _errs10 === errors;
    valid3 = valid3 || _valid0;
    if (!valid3) {
      const _errs12 = errors;
      if (errors === _errs12) {
        if (typeof data === "string") {
          if (!pattern5.test(data)) {
            const err5 = {};
            if (vErrors === null) {
              vErrors = [err5];
            } else {
              vErrors.push(err5);
            }
            errors++;
          }
        } else {
          const err6 = {};
          if (vErrors === null) {
            vErrors = [err6];
          } else {
            vErrors.push(err6);
          }
          errors++;
        }
      }
      var _valid0 = _errs12 === errors;
      valid3 = valid3 || _valid0;
      if (!valid3) {
        const _errs14 = errors;
        if (errors === _errs14) {
          if (typeof data === "string") {
            if (!pattern6.test(data)) {
              const err7 = {};
              if (vErrors === null) {
                vErrors = [err7];
              } else {
                vErrors.push(err7);
              }
              errors++;
            }
          } else {
            const err8 = {};
            if (vErrors === null) {
              vErrors = [err8];
            } else {
              vErrors.push(err8);
            }
            errors++;
          }
        }
        var _valid0 = _errs14 === errors;
        valid3 = valid3 || _valid0;
        if (!valid3) {
          const _errs16 = errors;
          if (errors === _errs16) {
            if (typeof data === "string") {
              if (!pattern7.test(data)) {
                const err9 = {};
                if (vErrors === null) {
                  vErrors = [err9];
                } else {
                  vErrors.push(err9);
                }
                errors++;
              }
            } else {
              const err10 = {};
              if (vErrors === null) {
                vErrors = [err10];
              } else {
                vErrors.push(err10);
              }
              errors++;
            }
          }
          var _valid0 = _errs16 === errors;
          valid3 = valid3 || _valid0;
          if (!valid3) {
            const _errs18 = errors;
            if (errors === _errs18) {
              if (typeof data === "string") {
                if (!pattern8.test(data)) {
                  const err11 = {};
                  if (vErrors === null) {
                    vErrors = [err11];
                  } else {
                    vErrors.push(err11);
                  }
                  errors++;
                }
              } else {
                const err12 = {};
                if (vErrors === null) {
                  vErrors = [err12];
                } else {
                  vErrors.push(err12);
                }
                errors++;
              }
            }
            var _valid0 = _errs18 === errors;
            valid3 = valid3 || _valid0;
            if (!valid3) {
              const _errs20 = errors;
              if (errors === _errs20) {
                if (typeof data === "string") {
                  if (!pattern9.test(data)) {
                    const err13 = {};
                    if (vErrors === null) {
                      vErrors = [err13];
                    } else {
                      vErrors.push(err13);
                    }
                    errors++;
                  }
                } else {
                  const err14 = {};
                  if (vErrors === null) {
                    vErrors = [err14];
                  } else {
                    vErrors.push(err14);
                  }
                  errors++;
                }
              }
              var _valid0 = _errs20 === errors;
              valid3 = valid3 || _valid0;
            }
          }
        }
      }
    }
  }
  if (!valid3) {
    const err15 = {};
    if (vErrors === null) {
      vErrors = [err15];
    } else {
      vErrors.push(err15);
    }
    errors++;
  } else {
    errors = _errs7;
    if (vErrors !== null) {
      if (_errs7) {
        vErrors.length = _errs7;
      } else {
        vErrors = null;
      }
    }
  }
  var valid2 = _errs5 === errors;
  if (valid2) {
    validate33.errors = [{ instancePath, schemaPath: "#/definitions/filteredString/not", keyword: "not", params: {}, message: "must NOT be valid" }];
    return false;
  } else {
    errors = _errs4;
    if (vErrors !== null) {
      if (_errs4) {
        vErrors.length = _errs4;
      } else {
        vErrors = null;
      }
    }
  }
  if (errors === _errs2) {
    if (typeof data === "string") {
      if (func2(data) > 16384) {
        validate33.errors = [{ instancePath, schemaPath: "#/definitions/filteredString/maxLength", keyword: "maxLength", params: { limit: 16384 }, message: "must NOT have more than 16384 characters" }];
        return false;
      }
    } else {
      validate33.errors = [{ instancePath, schemaPath: "#/definitions/filteredString/type", keyword: "type", params: { type: "string" }, message: "must be string" }];
      return false;
    }
  }
  if (errors === 0) {
    if (typeof data === "string") {
      if (func2(data) > 16384) {
        validate33.errors = [{ instancePath, schemaPath: "#/maxLength", keyword: "maxLength", params: { limit: 16384 }, message: "must NOT have more than 16384 characters" }];
        return false;
      }
    } else {
      validate33.errors = [{ instancePath, schemaPath: "#/type", keyword: "type", params: { type: "string" }, message: "must be string" }];
      return false;
    }
  }
  validate33.errors = vErrors;
  return errors === 0;
}
var pattern20 = new RegExp("@[iI][mM][pP][oO][rR][tT]", "u");
var pattern21 = new RegExp("@[fF][oO][nN][tT]-[fF][aA][cC][eE]", "u");
var pattern22 = new RegExp("@[dD][oO][cC][uU][mM][eE][nN][tT]", "u");
var pattern23 = new RegExp("@[cC][hH][aA][rR][sS][eE][tT]", "u");
function validate135(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  const _errs1 = errors;
  const _errs2 = errors;
  if (typeof data !== "string") {
    const err0 = {};
    if (vErrors === null) {
      vErrors = [err0];
    } else {
      vErrors.push(err0);
    }
    errors++;
  }
  const _errs4 = errors;
  let valid1 = false;
  const _errs5 = errors;
  if (errors === _errs5) {
    if (typeof data === "string") {
      if (!pattern20.test(data)) {
        const err1 = {};
        if (vErrors === null) {
          vErrors = [err1];
        } else {
          vErrors.push(err1);
        }
        errors++;
      }
    } else {
      const err2 = {};
      if (vErrors === null) {
        vErrors = [err2];
      } else {
        vErrors.push(err2);
      }
      errors++;
    }
  }
  var _valid0 = _errs5 === errors;
  valid1 = valid1 || _valid0;
  if (!valid1) {
    const _errs7 = errors;
    if (errors === _errs7) {
      if (typeof data === "string") {
        if (!pattern21.test(data)) {
          const err3 = {};
          if (vErrors === null) {
            vErrors = [err3];
          } else {
            vErrors.push(err3);
          }
          errors++;
        }
      } else {
        const err4 = {};
        if (vErrors === null) {
          vErrors = [err4];
        } else {
          vErrors.push(err4);
        }
        errors++;
      }
    }
    var _valid0 = _errs7 === errors;
    valid1 = valid1 || _valid0;
    if (!valid1) {
      const _errs9 = errors;
      if (errors === _errs9) {
        if (typeof data === "string") {
          if (!pattern22.test(data)) {
            const err5 = {};
            if (vErrors === null) {
              vErrors = [err5];
            } else {
              vErrors.push(err5);
            }
            errors++;
          }
        } else {
          const err6 = {};
          if (vErrors === null) {
            vErrors = [err6];
          } else {
            vErrors.push(err6);
          }
          errors++;
        }
      }
      var _valid0 = _errs9 === errors;
      valid1 = valid1 || _valid0;
      if (!valid1) {
        const _errs11 = errors;
        if (errors === _errs11) {
          if (typeof data === "string") {
            if (!pattern23.test(data)) {
              const err7 = {};
              if (vErrors === null) {
                vErrors = [err7];
              } else {
                vErrors.push(err7);
              }
              errors++;
            }
          } else {
            const err8 = {};
            if (vErrors === null) {
              vErrors = [err8];
            } else {
              vErrors.push(err8);
            }
            errors++;
          }
        }
        var _valid0 = _errs11 === errors;
        valid1 = valid1 || _valid0;
      }
    }
  }
  if (!valid1) {
    const err9 = {};
    if (vErrors === null) {
      vErrors = [err9];
    } else {
      vErrors.push(err9);
    }
    errors++;
  } else {
    errors = _errs4;
    if (vErrors !== null) {
      if (_errs4) {
        vErrors.length = _errs4;
      } else {
        vErrors = null;
      }
    }
  }
  var valid0 = _errs2 === errors;
  if (valid0) {
    validate135.errors = [{ instancePath, schemaPath: "#/not", keyword: "not", params: {}, message: "must NOT be valid" }];
    return false;
  } else {
    errors = _errs1;
    if (vErrors !== null) {
      if (_errs1) {
        vErrors.length = _errs1;
      } else {
        vErrors = null;
      }
    }
    const _errs14 = errors;
    const _errs16 = errors;
    const _errs17 = errors;
    if (typeof data !== "string") {
      const err10 = {};
      if (vErrors === null) {
        vErrors = [err10];
      } else {
        vErrors.push(err10);
      }
      errors++;
    }
    const _errs19 = errors;
    let valid5 = false;
    const _errs20 = errors;
    if (errors === _errs20) {
      if (typeof data === "string") {
        if (!pattern3.test(data)) {
          const err11 = {};
          if (vErrors === null) {
            vErrors = [err11];
          } else {
            vErrors.push(err11);
          }
          errors++;
        }
      } else {
        const err12 = {};
        if (vErrors === null) {
          vErrors = [err12];
        } else {
          vErrors.push(err12);
        }
        errors++;
      }
    }
    var _valid1 = _errs20 === errors;
    valid5 = valid5 || _valid1;
    if (!valid5) {
      const _errs22 = errors;
      if (errors === _errs22) {
        if (typeof data === "string") {
          if (!pattern4.test(data)) {
            const err13 = {};
            if (vErrors === null) {
              vErrors = [err13];
            } else {
              vErrors.push(err13);
            }
            errors++;
          }
        } else {
          const err14 = {};
          if (vErrors === null) {
            vErrors = [err14];
          } else {
            vErrors.push(err14);
          }
          errors++;
        }
      }
      var _valid1 = _errs22 === errors;
      valid5 = valid5 || _valid1;
      if (!valid5) {
        const _errs24 = errors;
        if (errors === _errs24) {
          if (typeof data === "string") {
            if (!pattern5.test(data)) {
              const err15 = {};
              if (vErrors === null) {
                vErrors = [err15];
              } else {
                vErrors.push(err15);
              }
              errors++;
            }
          } else {
            const err16 = {};
            if (vErrors === null) {
              vErrors = [err16];
            } else {
              vErrors.push(err16);
            }
            errors++;
          }
        }
        var _valid1 = _errs24 === errors;
        valid5 = valid5 || _valid1;
        if (!valid5) {
          const _errs26 = errors;
          if (errors === _errs26) {
            if (typeof data === "string") {
              if (!pattern6.test(data)) {
                const err17 = {};
                if (vErrors === null) {
                  vErrors = [err17];
                } else {
                  vErrors.push(err17);
                }
                errors++;
              }
            } else {
              const err18 = {};
              if (vErrors === null) {
                vErrors = [err18];
              } else {
                vErrors.push(err18);
              }
              errors++;
            }
          }
          var _valid1 = _errs26 === errors;
          valid5 = valid5 || _valid1;
          if (!valid5) {
            const _errs28 = errors;
            if (errors === _errs28) {
              if (typeof data === "string") {
                if (!pattern7.test(data)) {
                  const err19 = {};
                  if (vErrors === null) {
                    vErrors = [err19];
                  } else {
                    vErrors.push(err19);
                  }
                  errors++;
                }
              } else {
                const err20 = {};
                if (vErrors === null) {
                  vErrors = [err20];
                } else {
                  vErrors.push(err20);
                }
                errors++;
              }
            }
            var _valid1 = _errs28 === errors;
            valid5 = valid5 || _valid1;
            if (!valid5) {
              const _errs30 = errors;
              if (errors === _errs30) {
                if (typeof data === "string") {
                  if (!pattern8.test(data)) {
                    const err21 = {};
                    if (vErrors === null) {
                      vErrors = [err21];
                    } else {
                      vErrors.push(err21);
                    }
                    errors++;
                  }
                } else {
                  const err22 = {};
                  if (vErrors === null) {
                    vErrors = [err22];
                  } else {
                    vErrors.push(err22);
                  }
                  errors++;
                }
              }
              var _valid1 = _errs30 === errors;
              valid5 = valid5 || _valid1;
              if (!valid5) {
                const _errs32 = errors;
                if (errors === _errs32) {
                  if (typeof data === "string") {
                    if (!pattern9.test(data)) {
                      const err23 = {};
                      if (vErrors === null) {
                        vErrors = [err23];
                      } else {
                        vErrors.push(err23);
                      }
                      errors++;
                    }
                  } else {
                    const err24 = {};
                    if (vErrors === null) {
                      vErrors = [err24];
                    } else {
                      vErrors.push(err24);
                    }
                    errors++;
                  }
                }
                var _valid1 = _errs32 === errors;
                valid5 = valid5 || _valid1;
              }
            }
          }
        }
      }
    }
    if (!valid5) {
      const err25 = {};
      if (vErrors === null) {
        vErrors = [err25];
      } else {
        vErrors.push(err25);
      }
      errors++;
    } else {
      errors = _errs19;
      if (vErrors !== null) {
        if (_errs19) {
          vErrors.length = _errs19;
        } else {
          vErrors = null;
        }
      }
    }
    var valid4 = _errs17 === errors;
    if (valid4) {
      validate135.errors = [{ instancePath, schemaPath: "#/definitions/filteredString/not", keyword: "not", params: {}, message: "must NOT be valid" }];
      return false;
    } else {
      errors = _errs16;
      if (vErrors !== null) {
        if (_errs16) {
          vErrors.length = _errs16;
        } else {
          vErrors = null;
        }
      }
    }
    if (errors === _errs14) {
      if (typeof data === "string") {
        if (func2(data) > 16384) {
          validate135.errors = [{ instancePath, schemaPath: "#/definitions/filteredString/maxLength", keyword: "maxLength", params: { limit: 16384 }, message: "must NOT have more than 16384 characters" }];
          return false;
        }
      } else {
        validate135.errors = [{ instancePath, schemaPath: "#/definitions/filteredString/type", keyword: "type", params: { type: "string" }, message: "must be string" }];
        return false;
      }
    }
  }
  if (errors === 0) {
    if (typeof data === "string") {
      if (func2(data) > 4096) {
        validate135.errors = [{ instancePath, schemaPath: "#/maxLength", keyword: "maxLength", params: { limit: 4096 }, message: "must NOT have more than 4096 characters" }];
        return false;
      }
    } else {
      validate135.errors = [{ instancePath, schemaPath: "#/type", keyword: "type", params: { type: "string" }, message: "must be string" }];
      return false;
    }
  }
  validate135.errors = vErrors;
  return errors === 0;
}
var pattern18 = new RegExp("^#[a-zA-Z_][a-zA-Z0-9_.-]*$", "u");
var pattern19 = new RegExp("^data:image/(png|gif|jpeg|webp|avif);base64,[a-zA-Z0-9+/=]+$", "u");
function validate11(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  if (errors === 0) {
    if (data && typeof data == "object" && !Array.isArray(data)) {
      const _errs1 = errors;
      for (const key0 in data) {
        if (!func12.call(schema15.properties, key0)) {
          validate11.errors = [{ instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" }];
          return false;
          break;
        }
      }
      if (_errs1 === errors) {
        if (data["alignment-baseline"] !== void 0) {
          const _errs2 = errors;
          if (!validate12(data["alignment-baseline"], { instancePath: instancePath + "/alignment-baseline", parentData: data, parentDataProperty: "alignment-baseline", rootData })) {
            vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
            errors = vErrors.length;
          }
          var valid0 = _errs2 === errors;
        } else {
          var valid0 = true;
        }
        if (valid0) {
          if (data.amplitude !== void 0) {
            const _errs3 = errors;
            if (!validate12(data.amplitude, { instancePath: instancePath + "/amplitude", parentData: data, parentDataProperty: "amplitude", rootData })) {
              vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
              errors = vErrors.length;
            }
            var valid0 = _errs3 === errors;
          } else {
            var valid0 = true;
          }
          if (valid0) {
            if (data.azimuth !== void 0) {
              const _errs4 = errors;
              if (!validate12(data.azimuth, { instancePath: instancePath + "/azimuth", parentData: data, parentDataProperty: "azimuth", rootData })) {
                vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
                errors = vErrors.length;
              }
              var valid0 = _errs4 === errors;
            } else {
              var valid0 = true;
            }
            if (valid0) {
              if (data.baseFrequency !== void 0) {
                const _errs5 = errors;
                if (!validate12(data.baseFrequency, { instancePath: instancePath + "/baseFrequency", parentData: data, parentDataProperty: "baseFrequency", rootData })) {
                  vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
                  errors = vErrors.length;
                }
                var valid0 = _errs5 === errors;
              } else {
                var valid0 = true;
              }
              if (valid0) {
                if (data["baseline-shift"] !== void 0) {
                  const _errs6 = errors;
                  if (!validate12(data["baseline-shift"], { instancePath: instancePath + "/baseline-shift", parentData: data, parentDataProperty: "baseline-shift", rootData })) {
                    vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
                    errors = vErrors.length;
                  }
                  var valid0 = _errs6 === errors;
                } else {
                  var valid0 = true;
                }
                if (valid0) {
                  if (data.bias !== void 0) {
                    const _errs7 = errors;
                    if (!validate12(data.bias, { instancePath: instancePath + "/bias", parentData: data, parentDataProperty: "bias", rootData })) {
                      vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
                      errors = vErrors.length;
                    }
                    var valid0 = _errs7 === errors;
                  } else {
                    var valid0 = true;
                  }
                  if (valid0) {
                    if (data.class !== void 0) {
                      const _errs8 = errors;
                      if (!validate12(data.class, { instancePath: instancePath + "/class", parentData: data, parentDataProperty: "class", rootData })) {
                        vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
                        errors = vErrors.length;
                      }
                      var valid0 = _errs8 === errors;
                    } else {
                      var valid0 = true;
                    }
                    if (valid0) {
                      if (data.clipPathUnits !== void 0) {
                        const _errs9 = errors;
                        if (!validate12(data.clipPathUnits, { instancePath: instancePath + "/clipPathUnits", parentData: data, parentDataProperty: "clipPathUnits", rootData })) {
                          vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
                          errors = vErrors.length;
                        }
                        var valid0 = _errs9 === errors;
                      } else {
                        var valid0 = true;
                      }
                      if (valid0) {
                        if (data["clip-path"] !== void 0) {
                          const _errs10 = errors;
                          if (!validate12(data["clip-path"], { instancePath: instancePath + "/clip-path", parentData: data, parentDataProperty: "clip-path", rootData })) {
                            vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
                            errors = vErrors.length;
                          }
                          var valid0 = _errs10 === errors;
                        } else {
                          var valid0 = true;
                        }
                        if (valid0) {
                          if (data["clip-rule"] !== void 0) {
                            const _errs11 = errors;
                            if (!validate12(data["clip-rule"], { instancePath: instancePath + "/clip-rule", parentData: data, parentDataProperty: "clip-rule", rootData })) {
                              vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
                              errors = vErrors.length;
                            }
                            var valid0 = _errs11 === errors;
                          } else {
                            var valid0 = true;
                          }
                          if (valid0) {
                            if (data.color !== void 0) {
                              const _errs12 = errors;
                              if (!validate23(data.color, { instancePath: instancePath + "/color", parentData: data, parentDataProperty: "color", rootData })) {
                                vErrors = vErrors === null ? validate23.errors : vErrors.concat(validate23.errors);
                                errors = vErrors.length;
                              }
                              var valid0 = _errs12 === errors;
                            } else {
                              var valid0 = true;
                            }
                            if (valid0) {
                              if (data["color-interpolation"] !== void 0) {
                                const _errs13 = errors;
                                if (!validate12(data["color-interpolation"], { instancePath: instancePath + "/color-interpolation", parentData: data, parentDataProperty: "color-interpolation", rootData })) {
                                  vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
                                  errors = vErrors.length;
                                }
                                var valid0 = _errs13 === errors;
                              } else {
                                var valid0 = true;
                              }
                              if (valid0) {
                                if (data["color-interpolation-filters"] !== void 0) {
                                  const _errs14 = errors;
                                  if (!validate12(data["color-interpolation-filters"], { instancePath: instancePath + "/color-interpolation-filters", parentData: data, parentDataProperty: "color-interpolation-filters", rootData })) {
                                    vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
                                    errors = vErrors.length;
                                  }
                                  var valid0 = _errs14 === errors;
                                } else {
                                  var valid0 = true;
                                }
                                if (valid0) {
                                  if (data.crossorigin !== void 0) {
                                    const _errs15 = errors;
                                    if (!validate12(data.crossorigin, { instancePath: instancePath + "/crossorigin", parentData: data, parentDataProperty: "crossorigin", rootData })) {
                                      vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
                                      errors = vErrors.length;
                                    }
                                    var valid0 = _errs15 === errors;
                                  } else {
                                    var valid0 = true;
                                  }
                                  if (valid0) {
                                    if (data.cx !== void 0) {
                                      const _errs16 = errors;
                                      if (!validate12(data.cx, { instancePath: instancePath + "/cx", parentData: data, parentDataProperty: "cx", rootData })) {
                                        vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
                                        errors = vErrors.length;
                                      }
                                      var valid0 = _errs16 === errors;
                                    } else {
                                      var valid0 = true;
                                    }
                                    if (valid0) {
                                      if (data.cy !== void 0) {
                                        const _errs17 = errors;
                                        if (!validate12(data.cy, { instancePath: instancePath + "/cy", parentData: data, parentDataProperty: "cy", rootData })) {
                                          vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
                                          errors = vErrors.length;
                                        }
                                        var valid0 = _errs17 === errors;
                                      } else {
                                        var valid0 = true;
                                      }
                                      if (valid0) {
                                        if (data.d !== void 0) {
                                          const _errs18 = errors;
                                          if (!validate33(data.d, { instancePath: instancePath + "/d", parentData: data, parentDataProperty: "d", rootData })) {
                                            vErrors = vErrors === null ? validate33.errors : vErrors.concat(validate33.errors);
                                            errors = vErrors.length;
                                          }
                                          var valid0 = _errs18 === errors;
                                        } else {
                                          var valid0 = true;
                                        }
                                        if (valid0) {
                                          if (data.decoding !== void 0) {
                                            const _errs19 = errors;
                                            if (!validate12(data.decoding, { instancePath: instancePath + "/decoding", parentData: data, parentDataProperty: "decoding", rootData })) {
                                              vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
                                              errors = vErrors.length;
                                            }
                                            var valid0 = _errs19 === errors;
                                          } else {
                                            var valid0 = true;
                                          }
                                          if (valid0) {
                                            if (data.diffuseConstant !== void 0) {
                                              const _errs20 = errors;
                                              if (!validate12(data.diffuseConstant, { instancePath: instancePath + "/diffuseConstant", parentData: data, parentDataProperty: "diffuseConstant", rootData })) {
                                                vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
                                                errors = vErrors.length;
                                              }
                                              var valid0 = _errs20 === errors;
                                            } else {
                                              var valid0 = true;
                                            }
                                            if (valid0) {
                                              if (data.direction !== void 0) {
                                                const _errs21 = errors;
                                                if (!validate12(data.direction, { instancePath: instancePath + "/direction", parentData: data, parentDataProperty: "direction", rootData })) {
                                                  vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
                                                  errors = vErrors.length;
                                                }
                                                var valid0 = _errs21 === errors;
                                              } else {
                                                var valid0 = true;
                                              }
                                              if (valid0) {
                                                if (data.display !== void 0) {
                                                  const _errs22 = errors;
                                                  if (!validate12(data.display, { instancePath: instancePath + "/display", parentData: data, parentDataProperty: "display", rootData })) {
                                                    vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
                                                    errors = vErrors.length;
                                                  }
                                                  var valid0 = _errs22 === errors;
                                                } else {
                                                  var valid0 = true;
                                                }
                                                if (valid0) {
                                                  if (data.divisor !== void 0) {
                                                    const _errs23 = errors;
                                                    if (!validate12(data.divisor, { instancePath: instancePath + "/divisor", parentData: data, parentDataProperty: "divisor", rootData })) {
                                                      vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
                                                      errors = vErrors.length;
                                                    }
                                                    var valid0 = _errs23 === errors;
                                                  } else {
                                                    var valid0 = true;
                                                  }
                                                  if (valid0) {
                                                    if (data["dominant-baseline"] !== void 0) {
                                                      const _errs24 = errors;
                                                      if (!validate12(data["dominant-baseline"], { instancePath: instancePath + "/dominant-baseline", parentData: data, parentDataProperty: "dominant-baseline", rootData })) {
                                                        vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
                                                        errors = vErrors.length;
                                                      }
                                                      var valid0 = _errs24 === errors;
                                                    } else {
                                                      var valid0 = true;
                                                    }
                                                    if (valid0) {
                                                      if (data.dx !== void 0) {
                                                        const _errs25 = errors;
                                                        if (!validate12(data.dx, { instancePath: instancePath + "/dx", parentData: data, parentDataProperty: "dx", rootData })) {
                                                          vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
                                                          errors = vErrors.length;
                                                        }
                                                        var valid0 = _errs25 === errors;
                                                      } else {
                                                        var valid0 = true;
                                                      }
                                                      if (valid0) {
                                                        if (data.dy !== void 0) {
                                                          const _errs26 = errors;
                                                          if (!validate12(data.dy, { instancePath: instancePath + "/dy", parentData: data, parentDataProperty: "dy", rootData })) {
                                                            vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
                                                            errors = vErrors.length;
                                                          }
                                                          var valid0 = _errs26 === errors;
                                                        } else {
                                                          var valid0 = true;
                                                        }
                                                        if (valid0) {
                                                          if (data.edgeMode !== void 0) {
                                                            const _errs27 = errors;
                                                            if (!validate12(data.edgeMode, { instancePath: instancePath + "/edgeMode", parentData: data, parentDataProperty: "edgeMode", rootData })) {
                                                              vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
                                                              errors = vErrors.length;
                                                            }
                                                            var valid0 = _errs27 === errors;
                                                          } else {
                                                            var valid0 = true;
                                                          }
                                                          if (valid0) {
                                                            if (data.elevation !== void 0) {
                                                              const _errs28 = errors;
                                                              if (!validate12(data.elevation, { instancePath: instancePath + "/elevation", parentData: data, parentDataProperty: "elevation", rootData })) {
                                                                vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
                                                                errors = vErrors.length;
                                                              }
                                                              var valid0 = _errs28 === errors;
                                                            } else {
                                                              var valid0 = true;
                                                            }
                                                            if (valid0) {
                                                              if (data.exponent !== void 0) {
                                                                const _errs29 = errors;
                                                                if (!validate12(data.exponent, { instancePath: instancePath + "/exponent", parentData: data, parentDataProperty: "exponent", rootData })) {
                                                                  vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
                                                                  errors = vErrors.length;
                                                                }
                                                                var valid0 = _errs29 === errors;
                                                              } else {
                                                                var valid0 = true;
                                                              }
                                                              if (valid0) {
                                                                if (data.fill !== void 0) {
                                                                  const _errs30 = errors;
                                                                  if (!validate23(data.fill, { instancePath: instancePath + "/fill", parentData: data, parentDataProperty: "fill", rootData })) {
                                                                    vErrors = vErrors === null ? validate23.errors : vErrors.concat(validate23.errors);
                                                                    errors = vErrors.length;
                                                                  }
                                                                  var valid0 = _errs30 === errors;
                                                                } else {
                                                                  var valid0 = true;
                                                                }
                                                                if (valid0) {
                                                                  if (data["fill-opacity"] !== void 0) {
                                                                    const _errs31 = errors;
                                                                    if (!validate12(data["fill-opacity"], { instancePath: instancePath + "/fill-opacity", parentData: data, parentDataProperty: "fill-opacity", rootData })) {
                                                                      vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
                                                                      errors = vErrors.length;
                                                                    }
                                                                    var valid0 = _errs31 === errors;
                                                                  } else {
                                                                    var valid0 = true;
                                                                  }
                                                                  if (valid0) {
                                                                    if (data["fill-rule"] !== void 0) {
                                                                      const _errs32 = errors;
                                                                      if (!validate12(data["fill-rule"], { instancePath: instancePath + "/fill-rule", parentData: data, parentDataProperty: "fill-rule", rootData })) {
                                                                        vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
                                                                        errors = vErrors.length;
                                                                      }
                                                                      var valid0 = _errs32 === errors;
                                                                    } else {
                                                                      var valid0 = true;
                                                                    }
                                                                    if (valid0) {
                                                                      if (data.filter !== void 0) {
                                                                        const _errs33 = errors;
                                                                        if (!validate12(data.filter, { instancePath: instancePath + "/filter", parentData: data, parentDataProperty: "filter", rootData })) {
                                                                          vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
                                                                          errors = vErrors.length;
                                                                        }
                                                                        var valid0 = _errs33 === errors;
                                                                      } else {
                                                                        var valid0 = true;
                                                                      }
                                                                      if (valid0) {
                                                                        if (data.filterUnits !== void 0) {
                                                                          const _errs34 = errors;
                                                                          if (!validate12(data.filterUnits, { instancePath: instancePath + "/filterUnits", parentData: data, parentDataProperty: "filterUnits", rootData })) {
                                                                            vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
                                                                            errors = vErrors.length;
                                                                          }
                                                                          var valid0 = _errs34 === errors;
                                                                        } else {
                                                                          var valid0 = true;
                                                                        }
                                                                        if (valid0) {
                                                                          if (data["flood-color"] !== void 0) {
                                                                            const _errs35 = errors;
                                                                            if (!validate23(data["flood-color"], { instancePath: instancePath + "/flood-color", parentData: data, parentDataProperty: "flood-color", rootData })) {
                                                                              vErrors = vErrors === null ? validate23.errors : vErrors.concat(validate23.errors);
                                                                              errors = vErrors.length;
                                                                            }
                                                                            var valid0 = _errs35 === errors;
                                                                          } else {
                                                                            var valid0 = true;
                                                                          }
                                                                          if (valid0) {
                                                                            if (data["flood-opacity"] !== void 0) {
                                                                              const _errs36 = errors;
                                                                              if (!validate12(data["flood-opacity"], { instancePath: instancePath + "/flood-opacity", parentData: data, parentDataProperty: "flood-opacity", rootData })) {
                                                                                vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
                                                                                errors = vErrors.length;
                                                                              }
                                                                              var valid0 = _errs36 === errors;
                                                                            } else {
                                                                              var valid0 = true;
                                                                            }
                                                                            if (valid0) {
                                                                              if (data["font-family"] !== void 0) {
                                                                                let data35 = data["font-family"];
                                                                                const _errs37 = errors;
                                                                                const _errs38 = errors;
                                                                                let valid1 = false;
                                                                                const _errs39 = errors;
                                                                                if (!validate12(data35, { instancePath: instancePath + "/font-family", parentData: data, parentDataProperty: "font-family", rootData })) {
                                                                                  vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
                                                                                  errors = vErrors.length;
                                                                                }
                                                                                var _valid0 = _errs39 === errors;
                                                                                valid1 = valid1 || _valid0;
                                                                                if (!valid1) {
                                                                                  const _errs40 = errors;
                                                                                  if (errors === _errs40) {
                                                                                    if (data35 && typeof data35 == "object" && !Array.isArray(data35)) {
                                                                                      let missing0;
                                                                                      if (data35.type === void 0 && (missing0 = "type") || data35.name === void 0 && (missing0 = "name")) {
                                                                                        const err0 = { instancePath: instancePath + "/font-family", schemaPath: "#/properties/font-family/anyOf/1/required", keyword: "required", params: { missingProperty: missing0 }, message: "must have required property '" + missing0 + "'" };
                                                                                        if (vErrors === null) {
                                                                                          vErrors = [err0];
                                                                                        } else {
                                                                                          vErrors.push(err0);
                                                                                        }
                                                                                        errors++;
                                                                                      } else {
                                                                                        const _errs42 = errors;
                                                                                        for (const key1 in data35) {
                                                                                          if (!(key1 === "type" || key1 === "name")) {
                                                                                            const err1 = { instancePath: instancePath + "/font-family", schemaPath: "#/properties/font-family/anyOf/1/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" };
                                                                                            if (vErrors === null) {
                                                                                              vErrors = [err1];
                                                                                            } else {
                                                                                              vErrors.push(err1);
                                                                                            }
                                                                                            errors++;
                                                                                            break;
                                                                                          }
                                                                                        }
                                                                                        if (_errs42 === errors) {
                                                                                          if (data35.type !== void 0) {
                                                                                            const _errs43 = errors;
                                                                                            if ("variable" !== data35.type) {
                                                                                              const err2 = { instancePath: instancePath + "/font-family/type", schemaPath: "#/properties/font-family/anyOf/1/properties/type/const", keyword: "const", params: { allowedValue: "variable" }, message: "must be equal to constant" };
                                                                                              if (vErrors === null) {
                                                                                                vErrors = [err2];
                                                                                              } else {
                                                                                                vErrors.push(err2);
                                                                                              }
                                                                                              errors++;
                                                                                            }
                                                                                            var valid2 = _errs43 === errors;
                                                                                          } else {
                                                                                            var valid2 = true;
                                                                                          }
                                                                                          if (valid2) {
                                                                                            if (data35.name !== void 0) {
                                                                                              const _errs44 = errors;
                                                                                              if ("fontFamily" !== data35.name) {
                                                                                                const err3 = { instancePath: instancePath + "/font-family/name", schemaPath: "#/properties/font-family/anyOf/1/properties/name/const", keyword: "const", params: { allowedValue: "fontFamily" }, message: "must be equal to constant" };
                                                                                                if (vErrors === null) {
                                                                                                  vErrors = [err3];
                                                                                                } else {
                                                                                                  vErrors.push(err3);
                                                                                                }
                                                                                                errors++;
                                                                                              }
                                                                                              var valid2 = _errs44 === errors;
                                                                                            } else {
                                                                                              var valid2 = true;
                                                                                            }
                                                                                          }
                                                                                        }
                                                                                      }
                                                                                    } else {
                                                                                      const err4 = { instancePath: instancePath + "/font-family", schemaPath: "#/properties/font-family/anyOf/1/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                                                                                      if (vErrors === null) {
                                                                                        vErrors = [err4];
                                                                                      } else {
                                                                                        vErrors.push(err4);
                                                                                      }
                                                                                      errors++;
                                                                                    }
                                                                                  }
                                                                                  var _valid0 = _errs40 === errors;
                                                                                  valid1 = valid1 || _valid0;
                                                                                }
                                                                                if (!valid1) {
                                                                                  const err5 = { instancePath: instancePath + "/font-family", schemaPath: "#/properties/font-family/anyOf", keyword: "anyOf", params: {}, message: "must match a schema in anyOf" };
                                                                                  if (vErrors === null) {
                                                                                    vErrors = [err5];
                                                                                  } else {
                                                                                    vErrors.push(err5);
                                                                                  }
                                                                                  errors++;
                                                                                  validate11.errors = vErrors;
                                                                                  return false;
                                                                                } else {
                                                                                  errors = _errs38;
                                                                                  if (vErrors !== null) {
                                                                                    if (_errs38) {
                                                                                      vErrors.length = _errs38;
                                                                                    } else {
                                                                                      vErrors = null;
                                                                                    }
                                                                                  }
                                                                                }
                                                                                var valid0 = _errs37 === errors;
                                                                              } else {
                                                                                var valid0 = true;
                                                                              }
                                                                              if (valid0) {
                                                                                if (data["font-size"] !== void 0) {
                                                                                  const _errs45 = errors;
                                                                                  if (!validate12(data["font-size"], { instancePath: instancePath + "/font-size", parentData: data, parentDataProperty: "font-size", rootData })) {
                                                                                    vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
                                                                                    errors = vErrors.length;
                                                                                  }
                                                                                  var valid0 = _errs45 === errors;
                                                                                } else {
                                                                                  var valid0 = true;
                                                                                }
                                                                                if (valid0) {
                                                                                  if (data["font-size-adjust"] !== void 0) {
                                                                                    const _errs46 = errors;
                                                                                    if (!validate12(data["font-size-adjust"], { instancePath: instancePath + "/font-size-adjust", parentData: data, parentDataProperty: "font-size-adjust", rootData })) {
                                                                                      vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
                                                                                      errors = vErrors.length;
                                                                                    }
                                                                                    var valid0 = _errs46 === errors;
                                                                                  } else {
                                                                                    var valid0 = true;
                                                                                  }
                                                                                  if (valid0) {
                                                                                    if (data["font-style"] !== void 0) {
                                                                                      const _errs47 = errors;
                                                                                      if (!validate12(data["font-style"], { instancePath: instancePath + "/font-style", parentData: data, parentDataProperty: "font-style", rootData })) {
                                                                                        vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
                                                                                        errors = vErrors.length;
                                                                                      }
                                                                                      var valid0 = _errs47 === errors;
                                                                                    } else {
                                                                                      var valid0 = true;
                                                                                    }
                                                                                    if (valid0) {
                                                                                      if (data["font-variant"] !== void 0) {
                                                                                        const _errs48 = errors;
                                                                                        if (!validate12(data["font-variant"], { instancePath: instancePath + "/font-variant", parentData: data, parentDataProperty: "font-variant", rootData })) {
                                                                                          vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
                                                                                          errors = vErrors.length;
                                                                                        }
                                                                                        var valid0 = _errs48 === errors;
                                                                                      } else {
                                                                                        var valid0 = true;
                                                                                      }
                                                                                      if (valid0) {
                                                                                        if (data["font-weight"] !== void 0) {
                                                                                          let data42 = data["font-weight"];
                                                                                          const _errs49 = errors;
                                                                                          const _errs50 = errors;
                                                                                          let valid3 = false;
                                                                                          const _errs51 = errors;
                                                                                          if (!validate12(data42, { instancePath: instancePath + "/font-weight", parentData: data, parentDataProperty: "font-weight", rootData })) {
                                                                                            vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
                                                                                            errors = vErrors.length;
                                                                                          }
                                                                                          var _valid1 = _errs51 === errors;
                                                                                          valid3 = valid3 || _valid1;
                                                                                          if (!valid3) {
                                                                                            const _errs52 = errors;
                                                                                            if (errors === _errs52) {
                                                                                              if (data42 && typeof data42 == "object" && !Array.isArray(data42)) {
                                                                                                let missing1;
                                                                                                if (data42.type === void 0 && (missing1 = "type") || data42.name === void 0 && (missing1 = "name")) {
                                                                                                  const err6 = { instancePath: instancePath + "/font-weight", schemaPath: "#/properties/font-weight/anyOf/1/required", keyword: "required", params: { missingProperty: missing1 }, message: "must have required property '" + missing1 + "'" };
                                                                                                  if (vErrors === null) {
                                                                                                    vErrors = [err6];
                                                                                                  } else {
                                                                                                    vErrors.push(err6);
                                                                                                  }
                                                                                                  errors++;
                                                                                                } else {
                                                                                                  const _errs54 = errors;
                                                                                                  for (const key2 in data42) {
                                                                                                    if (!(key2 === "type" || key2 === "name")) {
                                                                                                      const err7 = { instancePath: instancePath + "/font-weight", schemaPath: "#/properties/font-weight/anyOf/1/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key2 }, message: "must NOT have additional properties" };
                                                                                                      if (vErrors === null) {
                                                                                                        vErrors = [err7];
                                                                                                      } else {
                                                                                                        vErrors.push(err7);
                                                                                                      }
                                                                                                      errors++;
                                                                                                      break;
                                                                                                    }
                                                                                                  }
                                                                                                  if (_errs54 === errors) {
                                                                                                    if (data42.type !== void 0) {
                                                                                                      const _errs55 = errors;
                                                                                                      if ("variable" !== data42.type) {
                                                                                                        const err8 = { instancePath: instancePath + "/font-weight/type", schemaPath: "#/properties/font-weight/anyOf/1/properties/type/const", keyword: "const", params: { allowedValue: "variable" }, message: "must be equal to constant" };
                                                                                                        if (vErrors === null) {
                                                                                                          vErrors = [err8];
                                                                                                        } else {
                                                                                                          vErrors.push(err8);
                                                                                                        }
                                                                                                        errors++;
                                                                                                      }
                                                                                                      var valid4 = _errs55 === errors;
                                                                                                    } else {
                                                                                                      var valid4 = true;
                                                                                                    }
                                                                                                    if (valid4) {
                                                                                                      if (data42.name !== void 0) {
                                                                                                        const _errs56 = errors;
                                                                                                        if ("fontWeight" !== data42.name) {
                                                                                                          const err9 = { instancePath: instancePath + "/font-weight/name", schemaPath: "#/properties/font-weight/anyOf/1/properties/name/const", keyword: "const", params: { allowedValue: "fontWeight" }, message: "must be equal to constant" };
                                                                                                          if (vErrors === null) {
                                                                                                            vErrors = [err9];
                                                                                                          } else {
                                                                                                            vErrors.push(err9);
                                                                                                          }
                                                                                                          errors++;
                                                                                                        }
                                                                                                        var valid4 = _errs56 === errors;
                                                                                                      } else {
                                                                                                        var valid4 = true;
                                                                                                      }
                                                                                                    }
                                                                                                  }
                                                                                                }
                                                                                              } else {
                                                                                                const err10 = { instancePath: instancePath + "/font-weight", schemaPath: "#/properties/font-weight/anyOf/1/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                                                                                                if (vErrors === null) {
                                                                                                  vErrors = [err10];
                                                                                                } else {
                                                                                                  vErrors.push(err10);
                                                                                                }
                                                                                                errors++;
                                                                                              }
                                                                                            }
                                                                                            var _valid1 = _errs52 === errors;
                                                                                            valid3 = valid3 || _valid1;
                                                                                          }
                                                                                          if (!valid3) {
                                                                                            const err11 = { instancePath: instancePath + "/font-weight", schemaPath: "#/properties/font-weight/anyOf", keyword: "anyOf", params: {}, message: "must match a schema in anyOf" };
                                                                                            if (vErrors === null) {
                                                                                              vErrors = [err11];
                                                                                            } else {
                                                                                              vErrors.push(err11);
                                                                                            }
                                                                                            errors++;
                                                                                            validate11.errors = vErrors;
                                                                                            return false;
                                                                                          } else {
                                                                                            errors = _errs50;
                                                                                            if (vErrors !== null) {
                                                                                              if (_errs50) {
                                                                                                vErrors.length = _errs50;
                                                                                              } else {
                                                                                                vErrors = null;
                                                                                              }
                                                                                            }
                                                                                          }
                                                                                          var valid0 = _errs49 === errors;
                                                                                        } else {
                                                                                          var valid0 = true;
                                                                                        }
                                                                                        if (valid0) {
                                                                                          if (data.fx !== void 0) {
                                                                                            const _errs57 = errors;
                                                                                            if (!validate12(data.fx, { instancePath: instancePath + "/fx", parentData: data, parentDataProperty: "fx", rootData })) {
                                                                                              vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
                                                                                              errors = vErrors.length;
                                                                                            }
                                                                                            var valid0 = _errs57 === errors;
                                                                                          } else {
                                                                                            var valid0 = true;
                                                                                          }
                                                                                          if (valid0) {
                                                                                            if (data.fy !== void 0) {
                                                                                              const _errs58 = errors;
                                                                                              if (!validate12(data.fy, { instancePath: instancePath + "/fy", parentData: data, parentDataProperty: "fy", rootData })) {
                                                                                                vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
                                                                                                errors = vErrors.length;
                                                                                              }
                                                                                              var valid0 = _errs58 === errors;
                                                                                            } else {
                                                                                              var valid0 = true;
                                                                                            }
                                                                                            if (valid0) {
                                                                                              if (data.gradientTransform !== void 0) {
                                                                                                const _errs59 = errors;
                                                                                                if (!validate12(data.gradientTransform, { instancePath: instancePath + "/gradientTransform", parentData: data, parentDataProperty: "gradientTransform", rootData })) {
                                                                                                  vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
                                                                                                  errors = vErrors.length;
                                                                                                }
                                                                                                var valid0 = _errs59 === errors;
                                                                                              } else {
                                                                                                var valid0 = true;
                                                                                              }
                                                                                              if (valid0) {
                                                                                                if (data.gradientUnits !== void 0) {
                                                                                                  const _errs60 = errors;
                                                                                                  if (!validate12(data.gradientUnits, { instancePath: instancePath + "/gradientUnits", parentData: data, parentDataProperty: "gradientUnits", rootData })) {
                                                                                                    vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
                                                                                                    errors = vErrors.length;
                                                                                                  }
                                                                                                  var valid0 = _errs60 === errors;
                                                                                                } else {
                                                                                                  var valid0 = true;
                                                                                                }
                                                                                                if (valid0) {
                                                                                                  if (data.height !== void 0) {
                                                                                                    const _errs61 = errors;
                                                                                                    if (!validate12(data.height, { instancePath: instancePath + "/height", parentData: data, parentDataProperty: "height", rootData })) {
                                                                                                      vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
                                                                                                      errors = vErrors.length;
                                                                                                    }
                                                                                                    var valid0 = _errs61 === errors;
                                                                                                  } else {
                                                                                                    var valid0 = true;
                                                                                                  }
                                                                                                  if (valid0) {
                                                                                                    if (data.href !== void 0) {
                                                                                                      let data50 = data.href;
                                                                                                      const _errs62 = errors;
                                                                                                      const _errs63 = errors;
                                                                                                      let valid5 = false;
                                                                                                      const _errs64 = errors;
                                                                                                      if (errors === _errs64) {
                                                                                                        if (typeof data50 === "string") {
                                                                                                          if (func2(data50) > 128) {
                                                                                                            const err12 = { instancePath: instancePath + "/href", schemaPath: "#/properties/href/anyOf/0/maxLength", keyword: "maxLength", params: { limit: 128 }, message: "must NOT have more than 128 characters" };
                                                                                                            if (vErrors === null) {
                                                                                                              vErrors = [err12];
                                                                                                            } else {
                                                                                                              vErrors.push(err12);
                                                                                                            }
                                                                                                            errors++;
                                                                                                          } else {
                                                                                                            if (!pattern18.test(data50)) {
                                                                                                              const err13 = { instancePath: instancePath + "/href", schemaPath: "#/properties/href/anyOf/0/pattern", keyword: "pattern", params: { pattern: "^#[a-zA-Z_][a-zA-Z0-9_.-]*$" }, message: 'must match pattern "^#[a-zA-Z_][a-zA-Z0-9_.-]*$"' };
                                                                                                              if (vErrors === null) {
                                                                                                                vErrors = [err13];
                                                                                                              } else {
                                                                                                                vErrors.push(err13);
                                                                                                              }
                                                                                                              errors++;
                                                                                                            }
                                                                                                          }
                                                                                                        } else {
                                                                                                          const err14 = { instancePath: instancePath + "/href", schemaPath: "#/properties/href/anyOf/0/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                                                                                          if (vErrors === null) {
                                                                                                            vErrors = [err14];
                                                                                                          } else {
                                                                                                            vErrors.push(err14);
                                                                                                          }
                                                                                                          errors++;
                                                                                                        }
                                                                                                      }
                                                                                                      var _valid2 = _errs64 === errors;
                                                                                                      valid5 = valid5 || _valid2;
                                                                                                      if (!valid5) {
                                                                                                        const _errs66 = errors;
                                                                                                        if (errors === _errs66) {
                                                                                                          if (typeof data50 === "string") {
                                                                                                            if (func2(data50) > 262144) {
                                                                                                              const err15 = { instancePath: instancePath + "/href", schemaPath: "#/properties/href/anyOf/1/maxLength", keyword: "maxLength", params: { limit: 262144 }, message: "must NOT have more than 262144 characters" };
                                                                                                              if (vErrors === null) {
                                                                                                                vErrors = [err15];
                                                                                                              } else {
                                                                                                                vErrors.push(err15);
                                                                                                              }
                                                                                                              errors++;
                                                                                                            } else {
                                                                                                              if (!pattern19.test(data50)) {
                                                                                                                const err16 = { instancePath: instancePath + "/href", schemaPath: "#/properties/href/anyOf/1/pattern", keyword: "pattern", params: { pattern: "^data:image/(png|gif|jpeg|webp|avif);base64,[a-zA-Z0-9+/=]+$" }, message: 'must match pattern "^data:image/(png|gif|jpeg|webp|avif);base64,[a-zA-Z0-9+/=]+$"' };
                                                                                                                if (vErrors === null) {
                                                                                                                  vErrors = [err16];
                                                                                                                } else {
                                                                                                                  vErrors.push(err16);
                                                                                                                }
                                                                                                                errors++;
                                                                                                              }
                                                                                                            }
                                                                                                          } else {
                                                                                                            const err17 = { instancePath: instancePath + "/href", schemaPath: "#/properties/href/anyOf/1/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                                                                                            if (vErrors === null) {
                                                                                                              vErrors = [err17];
                                                                                                            } else {
                                                                                                              vErrors.push(err17);
                                                                                                            }
                                                                                                            errors++;
                                                                                                          }
                                                                                                        }
                                                                                                        var _valid2 = _errs66 === errors;
                                                                                                        valid5 = valid5 || _valid2;
                                                                                                      }
                                                                                                      if (!valid5) {
                                                                                                        const err18 = { instancePath: instancePath + "/href", schemaPath: "#/properties/href/anyOf", keyword: "anyOf", params: {}, message: "must match a schema in anyOf" };
                                                                                                        if (vErrors === null) {
                                                                                                          vErrors = [err18];
                                                                                                        } else {
                                                                                                          vErrors.push(err18);
                                                                                                        }
                                                                                                        errors++;
                                                                                                        validate11.errors = vErrors;
                                                                                                        return false;
                                                                                                      } else {
                                                                                                        errors = _errs63;
                                                                                                        if (vErrors !== null) {
                                                                                                          if (_errs63) {
                                                                                                            vErrors.length = _errs63;
                                                                                                          } else {
                                                                                                            vErrors = null;
                                                                                                          }
                                                                                                        }
                                                                                                      }
                                                                                                      var valid0 = _errs62 === errors;
                                                                                                    } else {
                                                                                                      var valid0 = true;
                                                                                                    }
                                                                                                    if (valid0) {
                                                                                                      if (data.id !== void 0) {
                                                                                                        const _errs68 = errors;
                                                                                                        if (!validate12(data.id, { instancePath: instancePath + "/id", parentData: data, parentDataProperty: "id", rootData })) {
                                                                                                          vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
                                                                                                          errors = vErrors.length;
                                                                                                        }
                                                                                                        var valid0 = _errs68 === errors;
                                                                                                      } else {
                                                                                                        var valid0 = true;
                                                                                                      }
                                                                                                      if (valid0) {
                                                                                                        if (data["image-rendering"] !== void 0) {
                                                                                                          const _errs69 = errors;
                                                                                                          if (!validate12(data["image-rendering"], { instancePath: instancePath + "/image-rendering", parentData: data, parentDataProperty: "image-rendering", rootData })) {
                                                                                                            vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
                                                                                                            errors = vErrors.length;
                                                                                                          }
                                                                                                          var valid0 = _errs69 === errors;
                                                                                                        } else {
                                                                                                          var valid0 = true;
                                                                                                        }
                                                                                                        if (valid0) {
                                                                                                          if (data.in !== void 0) {
                                                                                                            const _errs70 = errors;
                                                                                                            if (!validate12(data.in, { instancePath: instancePath + "/in", parentData: data, parentDataProperty: "in", rootData })) {
                                                                                                              vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
                                                                                                              errors = vErrors.length;
                                                                                                            }
                                                                                                            var valid0 = _errs70 === errors;
                                                                                                          } else {
                                                                                                            var valid0 = true;
                                                                                                          }
                                                                                                          if (valid0) {
                                                                                                            if (data.in2 !== void 0) {
                                                                                                              const _errs71 = errors;
                                                                                                              if (!validate12(data.in2, { instancePath: instancePath + "/in2", parentData: data, parentDataProperty: "in2", rootData })) {
                                                                                                                vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
                                                                                                                errors = vErrors.length;
                                                                                                              }
                                                                                                              var valid0 = _errs71 === errors;
                                                                                                            } else {
                                                                                                              var valid0 = true;
                                                                                                            }
                                                                                                            if (valid0) {
                                                                                                              if (data.intercept !== void 0) {
                                                                                                                const _errs72 = errors;
                                                                                                                if (!validate12(data.intercept, { instancePath: instancePath + "/intercept", parentData: data, parentDataProperty: "intercept", rootData })) {
                                                                                                                  vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
                                                                                                                  errors = vErrors.length;
                                                                                                                }
                                                                                                                var valid0 = _errs72 === errors;
                                                                                                              } else {
                                                                                                                var valid0 = true;
                                                                                                              }
                                                                                                              if (valid0) {
                                                                                                                if (data.k1 !== void 0) {
                                                                                                                  const _errs73 = errors;
                                                                                                                  if (!validate12(data.k1, { instancePath: instancePath + "/k1", parentData: data, parentDataProperty: "k1", rootData })) {
                                                                                                                    vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
                                                                                                                    errors = vErrors.length;
                                                                                                                  }
                                                                                                                  var valid0 = _errs73 === errors;
                                                                                                                } else {
                                                                                                                  var valid0 = true;
                                                                                                                }
                                                                                                                if (valid0) {
                                                                                                                  if (data.k2 !== void 0) {
                                                                                                                    const _errs74 = errors;
                                                                                                                    if (!validate12(data.k2, { instancePath: instancePath + "/k2", parentData: data, parentDataProperty: "k2", rootData })) {
                                                                                                                      vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
                                                                                                                      errors = vErrors.length;
                                                                                                                    }
                                                                                                                    var valid0 = _errs74 === errors;
                                                                                                                  } else {
                                                                                                                    var valid0 = true;
                                                                                                                  }
                                                                                                                  if (valid0) {
                                                                                                                    if (data.k3 !== void 0) {
                                                                                                                      const _errs75 = errors;
                                                                                                                      if (!validate12(data.k3, { instancePath: instancePath + "/k3", parentData: data, parentDataProperty: "k3", rootData })) {
                                                                                                                        vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
                                                                                                                        errors = vErrors.length;
                                                                                                                      }
                                                                                                                      var valid0 = _errs75 === errors;
                                                                                                                    } else {
                                                                                                                      var valid0 = true;
                                                                                                                    }
                                                                                                                    if (valid0) {
                                                                                                                      if (data.k4 !== void 0) {
                                                                                                                        const _errs76 = errors;
                                                                                                                        if (!validate12(data.k4, { instancePath: instancePath + "/k4", parentData: data, parentDataProperty: "k4", rootData })) {
                                                                                                                          vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
                                                                                                                          errors = vErrors.length;
                                                                                                                        }
                                                                                                                        var valid0 = _errs76 === errors;
                                                                                                                      } else {
                                                                                                                        var valid0 = true;
                                                                                                                      }
                                                                                                                      if (valid0) {
                                                                                                                        if (data.kernelMatrix !== void 0) {
                                                                                                                          const _errs77 = errors;
                                                                                                                          if (!validate12(data.kernelMatrix, { instancePath: instancePath + "/kernelMatrix", parentData: data, parentDataProperty: "kernelMatrix", rootData })) {
                                                                                                                            vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
                                                                                                                            errors = vErrors.length;
                                                                                                                          }
                                                                                                                          var valid0 = _errs77 === errors;
                                                                                                                        } else {
                                                                                                                          var valid0 = true;
                                                                                                                        }
                                                                                                                        if (valid0) {
                                                                                                                          if (data.kernelUnitLength !== void 0) {
                                                                                                                            const _errs78 = errors;
                                                                                                                            if (!validate12(data.kernelUnitLength, { instancePath: instancePath + "/kernelUnitLength", parentData: data, parentDataProperty: "kernelUnitLength", rootData })) {
                                                                                                                              vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
                                                                                                                              errors = vErrors.length;
                                                                                                                            }
                                                                                                                            var valid0 = _errs78 === errors;
                                                                                                                          } else {
                                                                                                                            var valid0 = true;
                                                                                                                          }
                                                                                                                          if (valid0) {
                                                                                                                            if (data.lang !== void 0) {
                                                                                                                              const _errs79 = errors;
                                                                                                                              if (!validate12(data.lang, { instancePath: instancePath + "/lang", parentData: data, parentDataProperty: "lang", rootData })) {
                                                                                                                                vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
                                                                                                                                errors = vErrors.length;
                                                                                                                              }
                                                                                                                              var valid0 = _errs79 === errors;
                                                                                                                            } else {
                                                                                                                              var valid0 = true;
                                                                                                                            }
                                                                                                                            if (valid0) {
                                                                                                                              if (data.lengthAdjust !== void 0) {
                                                                                                                                const _errs80 = errors;
                                                                                                                                if (!validate12(data.lengthAdjust, { instancePath: instancePath + "/lengthAdjust", parentData: data, parentDataProperty: "lengthAdjust", rootData })) {
                                                                                                                                  vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
                                                                                                                                  errors = vErrors.length;
                                                                                                                                }
                                                                                                                                var valid0 = _errs80 === errors;
                                                                                                                              } else {
                                                                                                                                var valid0 = true;
                                                                                                                              }
                                                                                                                              if (valid0) {
                                                                                                                                if (data["letter-spacing"] !== void 0) {
                                                                                                                                  const _errs81 = errors;
                                                                                                                                  if (!validate12(data["letter-spacing"], { instancePath: instancePath + "/letter-spacing", parentData: data, parentDataProperty: "letter-spacing", rootData })) {
                                                                                                                                    vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
                                                                                                                                    errors = vErrors.length;
                                                                                                                                  }
                                                                                                                                  var valid0 = _errs81 === errors;
                                                                                                                                } else {
                                                                                                                                  var valid0 = true;
                                                                                                                                }
                                                                                                                                if (valid0) {
                                                                                                                                  if (data["lighting-color"] !== void 0) {
                                                                                                                                    const _errs82 = errors;
                                                                                                                                    if (!validate23(data["lighting-color"], { instancePath: instancePath + "/lighting-color", parentData: data, parentDataProperty: "lighting-color", rootData })) {
                                                                                                                                      vErrors = vErrors === null ? validate23.errors : vErrors.concat(validate23.errors);
                                                                                                                                      errors = vErrors.length;
                                                                                                                                    }
                                                                                                                                    var valid0 = _errs82 === errors;
                                                                                                                                  } else {
                                                                                                                                    var valid0 = true;
                                                                                                                                  }
                                                                                                                                  if (valid0) {
                                                                                                                                    if (data["marker-end"] !== void 0) {
                                                                                                                                      const _errs83 = errors;
                                                                                                                                      if (!validate12(data["marker-end"], { instancePath: instancePath + "/marker-end", parentData: data, parentDataProperty: "marker-end", rootData })) {
                                                                                                                                        vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
                                                                                                                                        errors = vErrors.length;
                                                                                                                                      }
                                                                                                                                      var valid0 = _errs83 === errors;
                                                                                                                                    } else {
                                                                                                                                      var valid0 = true;
                                                                                                                                    }
                                                                                                                                    if (valid0) {
                                                                                                                                      if (data["marker-mid"] !== void 0) {
                                                                                                                                        const _errs84 = errors;
                                                                                                                                        if (!validate12(data["marker-mid"], { instancePath: instancePath + "/marker-mid", parentData: data, parentDataProperty: "marker-mid", rootData })) {
                                                                                                                                          vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
                                                                                                                                          errors = vErrors.length;
                                                                                                                                        }
                                                                                                                                        var valid0 = _errs84 === errors;
                                                                                                                                      } else {
                                                                                                                                        var valid0 = true;
                                                                                                                                      }
                                                                                                                                      if (valid0) {
                                                                                                                                        if (data["marker-start"] !== void 0) {
                                                                                                                                          const _errs85 = errors;
                                                                                                                                          if (!validate12(data["marker-start"], { instancePath: instancePath + "/marker-start", parentData: data, parentDataProperty: "marker-start", rootData })) {
                                                                                                                                            vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
                                                                                                                                            errors = vErrors.length;
                                                                                                                                          }
                                                                                                                                          var valid0 = _errs85 === errors;
                                                                                                                                        } else {
                                                                                                                                          var valid0 = true;
                                                                                                                                        }
                                                                                                                                        if (valid0) {
                                                                                                                                          if (data.markerHeight !== void 0) {
                                                                                                                                            const _errs86 = errors;
                                                                                                                                            if (!validate12(data.markerHeight, { instancePath: instancePath + "/markerHeight", parentData: data, parentDataProperty: "markerHeight", rootData })) {
                                                                                                                                              vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
                                                                                                                                              errors = vErrors.length;
                                                                                                                                            }
                                                                                                                                            var valid0 = _errs86 === errors;
                                                                                                                                          } else {
                                                                                                                                            var valid0 = true;
                                                                                                                                          }
                                                                                                                                          if (valid0) {
                                                                                                                                            if (data.markerUnits !== void 0) {
                                                                                                                                              const _errs87 = errors;
                                                                                                                                              if (!validate12(data.markerUnits, { instancePath: instancePath + "/markerUnits", parentData: data, parentDataProperty: "markerUnits", rootData })) {
                                                                                                                                                vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
                                                                                                                                                errors = vErrors.length;
                                                                                                                                              }
                                                                                                                                              var valid0 = _errs87 === errors;
                                                                                                                                            } else {
                                                                                                                                              var valid0 = true;
                                                                                                                                            }
                                                                                                                                            if (valid0) {
                                                                                                                                              if (data.markerWidth !== void 0) {
                                                                                                                                                const _errs88 = errors;
                                                                                                                                                if (!validate12(data.markerWidth, { instancePath: instancePath + "/markerWidth", parentData: data, parentDataProperty: "markerWidth", rootData })) {
                                                                                                                                                  vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
                                                                                                                                                  errors = vErrors.length;
                                                                                                                                                }
                                                                                                                                                var valid0 = _errs88 === errors;
                                                                                                                                              } else {
                                                                                                                                                var valid0 = true;
                                                                                                                                              }
                                                                                                                                              if (valid0) {
                                                                                                                                                if (data.mask !== void 0) {
                                                                                                                                                  const _errs89 = errors;
                                                                                                                                                  if (!validate12(data.mask, { instancePath: instancePath + "/mask", parentData: data, parentDataProperty: "mask", rootData })) {
                                                                                                                                                    vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
                                                                                                                                                    errors = vErrors.length;
                                                                                                                                                  }
                                                                                                                                                  var valid0 = _errs89 === errors;
                                                                                                                                                } else {
                                                                                                                                                  var valid0 = true;
                                                                                                                                                }
                                                                                                                                                if (valid0) {
                                                                                                                                                  if (data.maskContentUnits !== void 0) {
                                                                                                                                                    const _errs90 = errors;
                                                                                                                                                    if (!validate12(data.maskContentUnits, { instancePath: instancePath + "/maskContentUnits", parentData: data, parentDataProperty: "maskContentUnits", rootData })) {
                                                                                                                                                      vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
                                                                                                                                                      errors = vErrors.length;
                                                                                                                                                    }
                                                                                                                                                    var valid0 = _errs90 === errors;
                                                                                                                                                  } else {
                                                                                                                                                    var valid0 = true;
                                                                                                                                                  }
                                                                                                                                                  if (valid0) {
                                                                                                                                                    if (data.maskUnits !== void 0) {
                                                                                                                                                      const _errs91 = errors;
                                                                                                                                                      if (!validate12(data.maskUnits, { instancePath: instancePath + "/maskUnits", parentData: data, parentDataProperty: "maskUnits", rootData })) {
                                                                                                                                                        vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
                                                                                                                                                        errors = vErrors.length;
                                                                                                                                                      }
                                                                                                                                                      var valid0 = _errs91 === errors;
                                                                                                                                                    } else {
                                                                                                                                                      var valid0 = true;
                                                                                                                                                    }
                                                                                                                                                    if (valid0) {
                                                                                                                                                      if (data.media !== void 0) {
                                                                                                                                                        const _errs92 = errors;
                                                                                                                                                        if (!validate12(data.media, { instancePath: instancePath + "/media", parentData: data, parentDataProperty: "media", rootData })) {
                                                                                                                                                          vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
                                                                                                                                                          errors = vErrors.length;
                                                                                                                                                        }
                                                                                                                                                        var valid0 = _errs92 === errors;
                                                                                                                                                      } else {
                                                                                                                                                        var valid0 = true;
                                                                                                                                                      }
                                                                                                                                                      if (valid0) {
                                                                                                                                                        if (data.method !== void 0) {
                                                                                                                                                          const _errs93 = errors;
                                                                                                                                                          if (!validate12(data.method, { instancePath: instancePath + "/method", parentData: data, parentDataProperty: "method", rootData })) {
                                                                                                                                                            vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
                                                                                                                                                            errors = vErrors.length;
                                                                                                                                                          }
                                                                                                                                                          var valid0 = _errs93 === errors;
                                                                                                                                                        } else {
                                                                                                                                                          var valid0 = true;
                                                                                                                                                        }
                                                                                                                                                        if (valid0) {
                                                                                                                                                          if (data.mode !== void 0) {
                                                                                                                                                            const _errs94 = errors;
                                                                                                                                                            if (!validate12(data.mode, { instancePath: instancePath + "/mode", parentData: data, parentDataProperty: "mode", rootData })) {
                                                                                                                                                              vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
                                                                                                                                                              errors = vErrors.length;
                                                                                                                                                            }
                                                                                                                                                            var valid0 = _errs94 === errors;
                                                                                                                                                          } else {
                                                                                                                                                            var valid0 = true;
                                                                                                                                                          }
                                                                                                                                                          if (valid0) {
                                                                                                                                                            if (data.numOctaves !== void 0) {
                                                                                                                                                              const _errs95 = errors;
                                                                                                                                                              if (!validate12(data.numOctaves, { instancePath: instancePath + "/numOctaves", parentData: data, parentDataProperty: "numOctaves", rootData })) {
                                                                                                                                                                vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
                                                                                                                                                                errors = vErrors.length;
                                                                                                                                                              }
                                                                                                                                                              var valid0 = _errs95 === errors;
                                                                                                                                                            } else {
                                                                                                                                                              var valid0 = true;
                                                                                                                                                            }
                                                                                                                                                            if (valid0) {
                                                                                                                                                              if (data.offset !== void 0) {
                                                                                                                                                                const _errs96 = errors;
                                                                                                                                                                if (!validate12(data.offset, { instancePath: instancePath + "/offset", parentData: data, parentDataProperty: "offset", rootData })) {
                                                                                                                                                                  vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
                                                                                                                                                                  errors = vErrors.length;
                                                                                                                                                                }
                                                                                                                                                                var valid0 = _errs96 === errors;
                                                                                                                                                              } else {
                                                                                                                                                                var valid0 = true;
                                                                                                                                                              }
                                                                                                                                                              if (valid0) {
                                                                                                                                                                if (data.opacity !== void 0) {
                                                                                                                                                                  const _errs97 = errors;
                                                                                                                                                                  if (!validate12(data.opacity, { instancePath: instancePath + "/opacity", parentData: data, parentDataProperty: "opacity", rootData })) {
                                                                                                                                                                    vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
                                                                                                                                                                    errors = vErrors.length;
                                                                                                                                                                  }
                                                                                                                                                                  var valid0 = _errs97 === errors;
                                                                                                                                                                } else {
                                                                                                                                                                  var valid0 = true;
                                                                                                                                                                }
                                                                                                                                                                if (valid0) {
                                                                                                                                                                  if (data.operator !== void 0) {
                                                                                                                                                                    const _errs98 = errors;
                                                                                                                                                                    if (!validate12(data.operator, { instancePath: instancePath + "/operator", parentData: data, parentDataProperty: "operator", rootData })) {
                                                                                                                                                                      vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
                                                                                                                                                                      errors = vErrors.length;
                                                                                                                                                                    }
                                                                                                                                                                    var valid0 = _errs98 === errors;
                                                                                                                                                                  } else {
                                                                                                                                                                    var valid0 = true;
                                                                                                                                                                  }
                                                                                                                                                                  if (valid0) {
                                                                                                                                                                    if (data.order !== void 0) {
                                                                                                                                                                      const _errs99 = errors;
                                                                                                                                                                      if (!validate12(data.order, { instancePath: instancePath + "/order", parentData: data, parentDataProperty: "order", rootData })) {
                                                                                                                                                                        vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
                                                                                                                                                                        errors = vErrors.length;
                                                                                                                                                                      }
                                                                                                                                                                      var valid0 = _errs99 === errors;
                                                                                                                                                                    } else {
                                                                                                                                                                      var valid0 = true;
                                                                                                                                                                    }
                                                                                                                                                                    if (valid0) {
                                                                                                                                                                      if (data.orient !== void 0) {
                                                                                                                                                                        const _errs100 = errors;
                                                                                                                                                                        if (!validate12(data.orient, { instancePath: instancePath + "/orient", parentData: data, parentDataProperty: "orient", rootData })) {
                                                                                                                                                                          vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
                                                                                                                                                                          errors = vErrors.length;
                                                                                                                                                                        }
                                                                                                                                                                        var valid0 = _errs100 === errors;
                                                                                                                                                                      } else {
                                                                                                                                                                        var valid0 = true;
                                                                                                                                                                      }
                                                                                                                                                                      if (valid0) {
                                                                                                                                                                        if (data.overflow !== void 0) {
                                                                                                                                                                          const _errs101 = errors;
                                                                                                                                                                          if (!validate12(data.overflow, { instancePath: instancePath + "/overflow", parentData: data, parentDataProperty: "overflow", rootData })) {
                                                                                                                                                                            vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
                                                                                                                                                                            errors = vErrors.length;
                                                                                                                                                                          }
                                                                                                                                                                          var valid0 = _errs101 === errors;
                                                                                                                                                                        } else {
                                                                                                                                                                          var valid0 = true;
                                                                                                                                                                        }
                                                                                                                                                                        if (valid0) {
                                                                                                                                                                          if (data["paint-order"] !== void 0) {
                                                                                                                                                                            const _errs102 = errors;
                                                                                                                                                                            if (!validate12(data["paint-order"], { instancePath: instancePath + "/paint-order", parentData: data, parentDataProperty: "paint-order", rootData })) {
                                                                                                                                                                              vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
                                                                                                                                                                              errors = vErrors.length;
                                                                                                                                                                            }
                                                                                                                                                                            var valid0 = _errs102 === errors;
                                                                                                                                                                          } else {
                                                                                                                                                                            var valid0 = true;
                                                                                                                                                                          }
                                                                                                                                                                          if (valid0) {
                                                                                                                                                                            if (data.path !== void 0) {
                                                                                                                                                                              const _errs103 = errors;
                                                                                                                                                                              if (!validate12(data.path, { instancePath: instancePath + "/path", parentData: data, parentDataProperty: "path", rootData })) {
                                                                                                                                                                                vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
                                                                                                                                                                                errors = vErrors.length;
                                                                                                                                                                              }
                                                                                                                                                                              var valid0 = _errs103 === errors;
                                                                                                                                                                            } else {
                                                                                                                                                                              var valid0 = true;
                                                                                                                                                                            }
                                                                                                                                                                            if (valid0) {
                                                                                                                                                                              if (data.pathLength !== void 0) {
                                                                                                                                                                                const _errs104 = errors;
                                                                                                                                                                                if (!validate12(data.pathLength, { instancePath: instancePath + "/pathLength", parentData: data, parentDataProperty: "pathLength", rootData })) {
                                                                                                                                                                                  vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
                                                                                                                                                                                  errors = vErrors.length;
                                                                                                                                                                                }
                                                                                                                                                                                var valid0 = _errs104 === errors;
                                                                                                                                                                              } else {
                                                                                                                                                                                var valid0 = true;
                                                                                                                                                                              }
                                                                                                                                                                              if (valid0) {
                                                                                                                                                                                if (data.patternContentUnits !== void 0) {
                                                                                                                                                                                  const _errs105 = errors;
                                                                                                                                                                                  if (!validate12(data.patternContentUnits, { instancePath: instancePath + "/patternContentUnits", parentData: data, parentDataProperty: "patternContentUnits", rootData })) {
                                                                                                                                                                                    vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
                                                                                                                                                                                    errors = vErrors.length;
                                                                                                                                                                                  }
                                                                                                                                                                                  var valid0 = _errs105 === errors;
                                                                                                                                                                                } else {
                                                                                                                                                                                  var valid0 = true;
                                                                                                                                                                                }
                                                                                                                                                                                if (valid0) {
                                                                                                                                                                                  if (data.patternTransform !== void 0) {
                                                                                                                                                                                    const _errs106 = errors;
                                                                                                                                                                                    if (!validate12(data.patternTransform, { instancePath: instancePath + "/patternTransform", parentData: data, parentDataProperty: "patternTransform", rootData })) {
                                                                                                                                                                                      vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
                                                                                                                                                                                      errors = vErrors.length;
                                                                                                                                                                                    }
                                                                                                                                                                                    var valid0 = _errs106 === errors;
                                                                                                                                                                                  } else {
                                                                                                                                                                                    var valid0 = true;
                                                                                                                                                                                  }
                                                                                                                                                                                  if (valid0) {
                                                                                                                                                                                    if (data.patternUnits !== void 0) {
                                                                                                                                                                                      const _errs107 = errors;
                                                                                                                                                                                      if (!validate12(data.patternUnits, { instancePath: instancePath + "/patternUnits", parentData: data, parentDataProperty: "patternUnits", rootData })) {
                                                                                                                                                                                        vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
                                                                                                                                                                                        errors = vErrors.length;
                                                                                                                                                                                      }
                                                                                                                                                                                      var valid0 = _errs107 === errors;
                                                                                                                                                                                    } else {
                                                                                                                                                                                      var valid0 = true;
                                                                                                                                                                                    }
                                                                                                                                                                                    if (valid0) {
                                                                                                                                                                                      if (data.points !== void 0) {
                                                                                                                                                                                        const _errs108 = errors;
                                                                                                                                                                                        if (!validate12(data.points, { instancePath: instancePath + "/points", parentData: data, parentDataProperty: "points", rootData })) {
                                                                                                                                                                                          vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
                                                                                                                                                                                          errors = vErrors.length;
                                                                                                                                                                                        }
                                                                                                                                                                                        var valid0 = _errs108 === errors;
                                                                                                                                                                                      } else {
                                                                                                                                                                                        var valid0 = true;
                                                                                                                                                                                      }
                                                                                                                                                                                      if (valid0) {
                                                                                                                                                                                        if (data.preserveAlpha !== void 0) {
                                                                                                                                                                                          const _errs109 = errors;
                                                                                                                                                                                          if (!validate12(data.preserveAlpha, { instancePath: instancePath + "/preserveAlpha", parentData: data, parentDataProperty: "preserveAlpha", rootData })) {
                                                                                                                                                                                            vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
                                                                                                                                                                                            errors = vErrors.length;
                                                                                                                                                                                          }
                                                                                                                                                                                          var valid0 = _errs109 === errors;
                                                                                                                                                                                        } else {
                                                                                                                                                                                          var valid0 = true;
                                                                                                                                                                                        }
                                                                                                                                                                                        if (valid0) {
                                                                                                                                                                                          if (data.preserveAspectRatio !== void 0) {
                                                                                                                                                                                            const _errs110 = errors;
                                                                                                                                                                                            if (!validate12(data.preserveAspectRatio, { instancePath: instancePath + "/preserveAspectRatio", parentData: data, parentDataProperty: "preserveAspectRatio", rootData })) {
                                                                                                                                                                                              vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
                                                                                                                                                                                              errors = vErrors.length;
                                                                                                                                                                                            }
                                                                                                                                                                                            var valid0 = _errs110 === errors;
                                                                                                                                                                                          } else {
                                                                                                                                                                                            var valid0 = true;
                                                                                                                                                                                          }
                                                                                                                                                                                          if (valid0) {
                                                                                                                                                                                            if (data.primitiveUnits !== void 0) {
                                                                                                                                                                                              const _errs111 = errors;
                                                                                                                                                                                              if (!validate12(data.primitiveUnits, { instancePath: instancePath + "/primitiveUnits", parentData: data, parentDataProperty: "primitiveUnits", rootData })) {
                                                                                                                                                                                                vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
                                                                                                                                                                                                errors = vErrors.length;
                                                                                                                                                                                              }
                                                                                                                                                                                              var valid0 = _errs111 === errors;
                                                                                                                                                                                            } else {
                                                                                                                                                                                              var valid0 = true;
                                                                                                                                                                                            }
                                                                                                                                                                                            if (valid0) {
                                                                                                                                                                                              if (data.r !== void 0) {
                                                                                                                                                                                                const _errs112 = errors;
                                                                                                                                                                                                if (!validate12(data.r, { instancePath: instancePath + "/r", parentData: data, parentDataProperty: "r", rootData })) {
                                                                                                                                                                                                  vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
                                                                                                                                                                                                  errors = vErrors.length;
                                                                                                                                                                                                }
                                                                                                                                                                                                var valid0 = _errs112 === errors;
                                                                                                                                                                                              } else {
                                                                                                                                                                                                var valid0 = true;
                                                                                                                                                                                              }
                                                                                                                                                                                              if (valid0) {
                                                                                                                                                                                                if (data.radius !== void 0) {
                                                                                                                                                                                                  const _errs113 = errors;
                                                                                                                                                                                                  if (!validate12(data.radius, { instancePath: instancePath + "/radius", parentData: data, parentDataProperty: "radius", rootData })) {
                                                                                                                                                                                                    vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
                                                                                                                                                                                                    errors = vErrors.length;
                                                                                                                                                                                                  }
                                                                                                                                                                                                  var valid0 = _errs113 === errors;
                                                                                                                                                                                                } else {
                                                                                                                                                                                                  var valid0 = true;
                                                                                                                                                                                                }
                                                                                                                                                                                                if (valid0) {
                                                                                                                                                                                                  if (data.refX !== void 0) {
                                                                                                                                                                                                    const _errs114 = errors;
                                                                                                                                                                                                    if (!validate12(data.refX, { instancePath: instancePath + "/refX", parentData: data, parentDataProperty: "refX", rootData })) {
                                                                                                                                                                                                      vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
                                                                                                                                                                                                      errors = vErrors.length;
                                                                                                                                                                                                    }
                                                                                                                                                                                                    var valid0 = _errs114 === errors;
                                                                                                                                                                                                  } else {
                                                                                                                                                                                                    var valid0 = true;
                                                                                                                                                                                                  }
                                                                                                                                                                                                  if (valid0) {
                                                                                                                                                                                                    if (data.refY !== void 0) {
                                                                                                                                                                                                      const _errs115 = errors;
                                                                                                                                                                                                      if (!validate12(data.refY, { instancePath: instancePath + "/refY", parentData: data, parentDataProperty: "refY", rootData })) {
                                                                                                                                                                                                        vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
                                                                                                                                                                                                        errors = vErrors.length;
                                                                                                                                                                                                      }
                                                                                                                                                                                                      var valid0 = _errs115 === errors;
                                                                                                                                                                                                    } else {
                                                                                                                                                                                                      var valid0 = true;
                                                                                                                                                                                                    }
                                                                                                                                                                                                    if (valid0) {
                                                                                                                                                                                                      if (data.result !== void 0) {
                                                                                                                                                                                                        const _errs116 = errors;
                                                                                                                                                                                                        if (!validate12(data.result, { instancePath: instancePath + "/result", parentData: data, parentDataProperty: "result", rootData })) {
                                                                                                                                                                                                          vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
                                                                                                                                                                                                          errors = vErrors.length;
                                                                                                                                                                                                        }
                                                                                                                                                                                                        var valid0 = _errs116 === errors;
                                                                                                                                                                                                      } else {
                                                                                                                                                                                                        var valid0 = true;
                                                                                                                                                                                                      }
                                                                                                                                                                                                      if (valid0) {
                                                                                                                                                                                                        if (data.rx !== void 0) {
                                                                                                                                                                                                          const _errs117 = errors;
                                                                                                                                                                                                          if (!validate12(data.rx, { instancePath: instancePath + "/rx", parentData: data, parentDataProperty: "rx", rootData })) {
                                                                                                                                                                                                            vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
                                                                                                                                                                                                            errors = vErrors.length;
                                                                                                                                                                                                          }
                                                                                                                                                                                                          var valid0 = _errs117 === errors;
                                                                                                                                                                                                        } else {
                                                                                                                                                                                                          var valid0 = true;
                                                                                                                                                                                                        }
                                                                                                                                                                                                        if (valid0) {
                                                                                                                                                                                                          if (data.ry !== void 0) {
                                                                                                                                                                                                            const _errs118 = errors;
                                                                                                                                                                                                            if (!validate12(data.ry, { instancePath: instancePath + "/ry", parentData: data, parentDataProperty: "ry", rootData })) {
                                                                                                                                                                                                              vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
                                                                                                                                                                                                              errors = vErrors.length;
                                                                                                                                                                                                            }
                                                                                                                                                                                                            var valid0 = _errs118 === errors;
                                                                                                                                                                                                          } else {
                                                                                                                                                                                                            var valid0 = true;
                                                                                                                                                                                                          }
                                                                                                                                                                                                          if (valid0) {
                                                                                                                                                                                                            if (data.scale !== void 0) {
                                                                                                                                                                                                              const _errs119 = errors;
                                                                                                                                                                                                              if (!validate12(data.scale, { instancePath: instancePath + "/scale", parentData: data, parentDataProperty: "scale", rootData })) {
                                                                                                                                                                                                                vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
                                                                                                                                                                                                                errors = vErrors.length;
                                                                                                                                                                                                              }
                                                                                                                                                                                                              var valid0 = _errs119 === errors;
                                                                                                                                                                                                            } else {
                                                                                                                                                                                                              var valid0 = true;
                                                                                                                                                                                                            }
                                                                                                                                                                                                            if (valid0) {
                                                                                                                                                                                                              if (data.seed !== void 0) {
                                                                                                                                                                                                                const _errs120 = errors;
                                                                                                                                                                                                                if (!validate12(data.seed, { instancePath: instancePath + "/seed", parentData: data, parentDataProperty: "seed", rootData })) {
                                                                                                                                                                                                                  vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
                                                                                                                                                                                                                  errors = vErrors.length;
                                                                                                                                                                                                                }
                                                                                                                                                                                                                var valid0 = _errs120 === errors;
                                                                                                                                                                                                              } else {
                                                                                                                                                                                                                var valid0 = true;
                                                                                                                                                                                                              }
                                                                                                                                                                                                              if (valid0) {
                                                                                                                                                                                                                if (data["shape-rendering"] !== void 0) {
                                                                                                                                                                                                                  const _errs121 = errors;
                                                                                                                                                                                                                  if (!validate12(data["shape-rendering"], { instancePath: instancePath + "/shape-rendering", parentData: data, parentDataProperty: "shape-rendering", rootData })) {
                                                                                                                                                                                                                    vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
                                                                                                                                                                                                                    errors = vErrors.length;
                                                                                                                                                                                                                  }
                                                                                                                                                                                                                  var valid0 = _errs121 === errors;
                                                                                                                                                                                                                } else {
                                                                                                                                                                                                                  var valid0 = true;
                                                                                                                                                                                                                }
                                                                                                                                                                                                                if (valid0) {
                                                                                                                                                                                                                  if (data.slope !== void 0) {
                                                                                                                                                                                                                    const _errs122 = errors;
                                                                                                                                                                                                                    if (!validate12(data.slope, { instancePath: instancePath + "/slope", parentData: data, parentDataProperty: "slope", rootData })) {
                                                                                                                                                                                                                      vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
                                                                                                                                                                                                                      errors = vErrors.length;
                                                                                                                                                                                                                    }
                                                                                                                                                                                                                    var valid0 = _errs122 === errors;
                                                                                                                                                                                                                  } else {
                                                                                                                                                                                                                    var valid0 = true;
                                                                                                                                                                                                                  }
                                                                                                                                                                                                                  if (valid0) {
                                                                                                                                                                                                                    if (data.specularConstant !== void 0) {
                                                                                                                                                                                                                      const _errs123 = errors;
                                                                                                                                                                                                                      if (!validate12(data.specularConstant, { instancePath: instancePath + "/specularConstant", parentData: data, parentDataProperty: "specularConstant", rootData })) {
                                                                                                                                                                                                                        vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
                                                                                                                                                                                                                        errors = vErrors.length;
                                                                                                                                                                                                                      }
                                                                                                                                                                                                                      var valid0 = _errs123 === errors;
                                                                                                                                                                                                                    } else {
                                                                                                                                                                                                                      var valid0 = true;
                                                                                                                                                                                                                    }
                                                                                                                                                                                                                    if (valid0) {
                                                                                                                                                                                                                      if (data.specularExponent !== void 0) {
                                                                                                                                                                                                                        const _errs124 = errors;
                                                                                                                                                                                                                        if (!validate12(data.specularExponent, { instancePath: instancePath + "/specularExponent", parentData: data, parentDataProperty: "specularExponent", rootData })) {
                                                                                                                                                                                                                          vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
                                                                                                                                                                                                                          errors = vErrors.length;
                                                                                                                                                                                                                        }
                                                                                                                                                                                                                        var valid0 = _errs124 === errors;
                                                                                                                                                                                                                      } else {
                                                                                                                                                                                                                        var valid0 = true;
                                                                                                                                                                                                                      }
                                                                                                                                                                                                                      if (valid0) {
                                                                                                                                                                                                                        if (data.spreadMethod !== void 0) {
                                                                                                                                                                                                                          const _errs125 = errors;
                                                                                                                                                                                                                          if (!validate12(data.spreadMethod, { instancePath: instancePath + "/spreadMethod", parentData: data, parentDataProperty: "spreadMethod", rootData })) {
                                                                                                                                                                                                                            vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
                                                                                                                                                                                                                            errors = vErrors.length;
                                                                                                                                                                                                                          }
                                                                                                                                                                                                                          var valid0 = _errs125 === errors;
                                                                                                                                                                                                                        } else {
                                                                                                                                                                                                                          var valid0 = true;
                                                                                                                                                                                                                        }
                                                                                                                                                                                                                        if (valid0) {
                                                                                                                                                                                                                          if (data.startOffset !== void 0) {
                                                                                                                                                                                                                            const _errs126 = errors;
                                                                                                                                                                                                                            if (!validate12(data.startOffset, { instancePath: instancePath + "/startOffset", parentData: data, parentDataProperty: "startOffset", rootData })) {
                                                                                                                                                                                                                              vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
                                                                                                                                                                                                                              errors = vErrors.length;
                                                                                                                                                                                                                            }
                                                                                                                                                                                                                            var valid0 = _errs126 === errors;
                                                                                                                                                                                                                          } else {
                                                                                                                                                                                                                            var valid0 = true;
                                                                                                                                                                                                                          }
                                                                                                                                                                                                                          if (valid0) {
                                                                                                                                                                                                                            if (data.stdDeviation !== void 0) {
                                                                                                                                                                                                                              const _errs127 = errors;
                                                                                                                                                                                                                              if (!validate12(data.stdDeviation, { instancePath: instancePath + "/stdDeviation", parentData: data, parentDataProperty: "stdDeviation", rootData })) {
                                                                                                                                                                                                                                vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
                                                                                                                                                                                                                                errors = vErrors.length;
                                                                                                                                                                                                                              }
                                                                                                                                                                                                                              var valid0 = _errs127 === errors;
                                                                                                                                                                                                                            } else {
                                                                                                                                                                                                                              var valid0 = true;
                                                                                                                                                                                                                            }
                                                                                                                                                                                                                            if (valid0) {
                                                                                                                                                                                                                              if (data.stitchTiles !== void 0) {
                                                                                                                                                                                                                                const _errs128 = errors;
                                                                                                                                                                                                                                if (!validate12(data.stitchTiles, { instancePath: instancePath + "/stitchTiles", parentData: data, parentDataProperty: "stitchTiles", rootData })) {
                                                                                                                                                                                                                                  vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
                                                                                                                                                                                                                                  errors = vErrors.length;
                                                                                                                                                                                                                                }
                                                                                                                                                                                                                                var valid0 = _errs128 === errors;
                                                                                                                                                                                                                              } else {
                                                                                                                                                                                                                                var valid0 = true;
                                                                                                                                                                                                                              }
                                                                                                                                                                                                                              if (valid0) {
                                                                                                                                                                                                                                if (data["stop-color"] !== void 0) {
                                                                                                                                                                                                                                  const _errs129 = errors;
                                                                                                                                                                                                                                  if (!validate23(data["stop-color"], { instancePath: instancePath + "/stop-color", parentData: data, parentDataProperty: "stop-color", rootData })) {
                                                                                                                                                                                                                                    vErrors = vErrors === null ? validate23.errors : vErrors.concat(validate23.errors);
                                                                                                                                                                                                                                    errors = vErrors.length;
                                                                                                                                                                                                                                  }
                                                                                                                                                                                                                                  var valid0 = _errs129 === errors;
                                                                                                                                                                                                                                } else {
                                                                                                                                                                                                                                  var valid0 = true;
                                                                                                                                                                                                                                }
                                                                                                                                                                                                                                if (valid0) {
                                                                                                                                                                                                                                  if (data["stop-opacity"] !== void 0) {
                                                                                                                                                                                                                                    const _errs130 = errors;
                                                                                                                                                                                                                                    if (!validate12(data["stop-opacity"], { instancePath: instancePath + "/stop-opacity", parentData: data, parentDataProperty: "stop-opacity", rootData })) {
                                                                                                                                                                                                                                      vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
                                                                                                                                                                                                                                      errors = vErrors.length;
                                                                                                                                                                                                                                    }
                                                                                                                                                                                                                                    var valid0 = _errs130 === errors;
                                                                                                                                                                                                                                  } else {
                                                                                                                                                                                                                                    var valid0 = true;
                                                                                                                                                                                                                                  }
                                                                                                                                                                                                                                  if (valid0) {
                                                                                                                                                                                                                                    if (data.stroke !== void 0) {
                                                                                                                                                                                                                                      const _errs131 = errors;
                                                                                                                                                                                                                                      if (!validate23(data.stroke, { instancePath: instancePath + "/stroke", parentData: data, parentDataProperty: "stroke", rootData })) {
                                                                                                                                                                                                                                        vErrors = vErrors === null ? validate23.errors : vErrors.concat(validate23.errors);
                                                                                                                                                                                                                                        errors = vErrors.length;
                                                                                                                                                                                                                                      }
                                                                                                                                                                                                                                      var valid0 = _errs131 === errors;
                                                                                                                                                                                                                                    } else {
                                                                                                                                                                                                                                      var valid0 = true;
                                                                                                                                                                                                                                    }
                                                                                                                                                                                                                                    if (valid0) {
                                                                                                                                                                                                                                      if (data["stroke-dasharray"] !== void 0) {
                                                                                                                                                                                                                                        const _errs132 = errors;
                                                                                                                                                                                                                                        if (!validate12(data["stroke-dasharray"], { instancePath: instancePath + "/stroke-dasharray", parentData: data, parentDataProperty: "stroke-dasharray", rootData })) {
                                                                                                                                                                                                                                          vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
                                                                                                                                                                                                                                          errors = vErrors.length;
                                                                                                                                                                                                                                        }
                                                                                                                                                                                                                                        var valid0 = _errs132 === errors;
                                                                                                                                                                                                                                      } else {
                                                                                                                                                                                                                                        var valid0 = true;
                                                                                                                                                                                                                                      }
                                                                                                                                                                                                                                      if (valid0) {
                                                                                                                                                                                                                                        if (data["stroke-dashoffset"] !== void 0) {
                                                                                                                                                                                                                                          const _errs133 = errors;
                                                                                                                                                                                                                                          if (!validate12(data["stroke-dashoffset"], { instancePath: instancePath + "/stroke-dashoffset", parentData: data, parentDataProperty: "stroke-dashoffset", rootData })) {
                                                                                                                                                                                                                                            vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
                                                                                                                                                                                                                                            errors = vErrors.length;
                                                                                                                                                                                                                                          }
                                                                                                                                                                                                                                          var valid0 = _errs133 === errors;
                                                                                                                                                                                                                                        } else {
                                                                                                                                                                                                                                          var valid0 = true;
                                                                                                                                                                                                                                        }
                                                                                                                                                                                                                                        if (valid0) {
                                                                                                                                                                                                                                          if (data["stroke-linecap"] !== void 0) {
                                                                                                                                                                                                                                            const _errs134 = errors;
                                                                                                                                                                                                                                            if (!validate12(data["stroke-linecap"], { instancePath: instancePath + "/stroke-linecap", parentData: data, parentDataProperty: "stroke-linecap", rootData })) {
                                                                                                                                                                                                                                              vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
                                                                                                                                                                                                                                              errors = vErrors.length;
                                                                                                                                                                                                                                            }
                                                                                                                                                                                                                                            var valid0 = _errs134 === errors;
                                                                                                                                                                                                                                          } else {
                                                                                                                                                                                                                                            var valid0 = true;
                                                                                                                                                                                                                                          }
                                                                                                                                                                                                                                          if (valid0) {
                                                                                                                                                                                                                                            if (data["stroke-linejoin"] !== void 0) {
                                                                                                                                                                                                                                              const _errs135 = errors;
                                                                                                                                                                                                                                              if (!validate12(data["stroke-linejoin"], { instancePath: instancePath + "/stroke-linejoin", parentData: data, parentDataProperty: "stroke-linejoin", rootData })) {
                                                                                                                                                                                                                                                vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
                                                                                                                                                                                                                                                errors = vErrors.length;
                                                                                                                                                                                                                                              }
                                                                                                                                                                                                                                              var valid0 = _errs135 === errors;
                                                                                                                                                                                                                                            } else {
                                                                                                                                                                                                                                              var valid0 = true;
                                                                                                                                                                                                                                            }
                                                                                                                                                                                                                                            if (valid0) {
                                                                                                                                                                                                                                              if (data["stroke-miterlimit"] !== void 0) {
                                                                                                                                                                                                                                                const _errs136 = errors;
                                                                                                                                                                                                                                                if (!validate12(data["stroke-miterlimit"], { instancePath: instancePath + "/stroke-miterlimit", parentData: data, parentDataProperty: "stroke-miterlimit", rootData })) {
                                                                                                                                                                                                                                                  vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
                                                                                                                                                                                                                                                  errors = vErrors.length;
                                                                                                                                                                                                                                                }
                                                                                                                                                                                                                                                var valid0 = _errs136 === errors;
                                                                                                                                                                                                                                              } else {
                                                                                                                                                                                                                                                var valid0 = true;
                                                                                                                                                                                                                                              }
                                                                                                                                                                                                                                              if (valid0) {
                                                                                                                                                                                                                                                if (data["stroke-opacity"] !== void 0) {
                                                                                                                                                                                                                                                  const _errs137 = errors;
                                                                                                                                                                                                                                                  if (!validate12(data["stroke-opacity"], { instancePath: instancePath + "/stroke-opacity", parentData: data, parentDataProperty: "stroke-opacity", rootData })) {
                                                                                                                                                                                                                                                    vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
                                                                                                                                                                                                                                                    errors = vErrors.length;
                                                                                                                                                                                                                                                  }
                                                                                                                                                                                                                                                  var valid0 = _errs137 === errors;
                                                                                                                                                                                                                                                } else {
                                                                                                                                                                                                                                                  var valid0 = true;
                                                                                                                                                                                                                                                }
                                                                                                                                                                                                                                                if (valid0) {
                                                                                                                                                                                                                                                  if (data["stroke-width"] !== void 0) {
                                                                                                                                                                                                                                                    const _errs138 = errors;
                                                                                                                                                                                                                                                    if (!validate12(data["stroke-width"], { instancePath: instancePath + "/stroke-width", parentData: data, parentDataProperty: "stroke-width", rootData })) {
                                                                                                                                                                                                                                                      vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
                                                                                                                                                                                                                                                      errors = vErrors.length;
                                                                                                                                                                                                                                                    }
                                                                                                                                                                                                                                                    var valid0 = _errs138 === errors;
                                                                                                                                                                                                                                                  } else {
                                                                                                                                                                                                                                                    var valid0 = true;
                                                                                                                                                                                                                                                  }
                                                                                                                                                                                                                                                  if (valid0) {
                                                                                                                                                                                                                                                    if (data.style !== void 0) {
                                                                                                                                                                                                                                                      const _errs139 = errors;
                                                                                                                                                                                                                                                      if (!validate135(data.style, { instancePath: instancePath + "/style", parentData: data, parentDataProperty: "style", rootData })) {
                                                                                                                                                                                                                                                        vErrors = vErrors === null ? validate135.errors : vErrors.concat(validate135.errors);
                                                                                                                                                                                                                                                        errors = vErrors.length;
                                                                                                                                                                                                                                                      }
                                                                                                                                                                                                                                                      var valid0 = _errs139 === errors;
                                                                                                                                                                                                                                                    } else {
                                                                                                                                                                                                                                                      var valid0 = true;
                                                                                                                                                                                                                                                    }
                                                                                                                                                                                                                                                    if (valid0) {
                                                                                                                                                                                                                                                      if (data.surfaceScale !== void 0) {
                                                                                                                                                                                                                                                        const _errs140 = errors;
                                                                                                                                                                                                                                                        if (!validate12(data.surfaceScale, { instancePath: instancePath + "/surfaceScale", parentData: data, parentDataProperty: "surfaceScale", rootData })) {
                                                                                                                                                                                                                                                          vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
                                                                                                                                                                                                                                                          errors = vErrors.length;
                                                                                                                                                                                                                                                        }
                                                                                                                                                                                                                                                        var valid0 = _errs140 === errors;
                                                                                                                                                                                                                                                      } else {
                                                                                                                                                                                                                                                        var valid0 = true;
                                                                                                                                                                                                                                                      }
                                                                                                                                                                                                                                                      if (valid0) {
                                                                                                                                                                                                                                                        if (data.systemLanguage !== void 0) {
                                                                                                                                                                                                                                                          const _errs141 = errors;
                                                                                                                                                                                                                                                          if (!validate12(data.systemLanguage, { instancePath: instancePath + "/systemLanguage", parentData: data, parentDataProperty: "systemLanguage", rootData })) {
                                                                                                                                                                                                                                                            vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
                                                                                                                                                                                                                                                            errors = vErrors.length;
                                                                                                                                                                                                                                                          }
                                                                                                                                                                                                                                                          var valid0 = _errs141 === errors;
                                                                                                                                                                                                                                                        } else {
                                                                                                                                                                                                                                                          var valid0 = true;
                                                                                                                                                                                                                                                        }
                                                                                                                                                                                                                                                        if (valid0) {
                                                                                                                                                                                                                                                          if (data.tabindex !== void 0) {
                                                                                                                                                                                                                                                            const _errs142 = errors;
                                                                                                                                                                                                                                                            if (!validate12(data.tabindex, { instancePath: instancePath + "/tabindex", parentData: data, parentDataProperty: "tabindex", rootData })) {
                                                                                                                                                                                                                                                              vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
                                                                                                                                                                                                                                                              errors = vErrors.length;
                                                                                                                                                                                                                                                            }
                                                                                                                                                                                                                                                            var valid0 = _errs142 === errors;
                                                                                                                                                                                                                                                          } else {
                                                                                                                                                                                                                                                            var valid0 = true;
                                                                                                                                                                                                                                                          }
                                                                                                                                                                                                                                                          if (valid0) {
                                                                                                                                                                                                                                                            if (data.tableValues !== void 0) {
                                                                                                                                                                                                                                                              const _errs143 = errors;
                                                                                                                                                                                                                                                              if (!validate12(data.tableValues, { instancePath: instancePath + "/tableValues", parentData: data, parentDataProperty: "tableValues", rootData })) {
                                                                                                                                                                                                                                                                vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
                                                                                                                                                                                                                                                                errors = vErrors.length;
                                                                                                                                                                                                                                                              }
                                                                                                                                                                                                                                                              var valid0 = _errs143 === errors;
                                                                                                                                                                                                                                                            } else {
                                                                                                                                                                                                                                                              var valid0 = true;
                                                                                                                                                                                                                                                            }
                                                                                                                                                                                                                                                            if (valid0) {
                                                                                                                                                                                                                                                              if (data.targetX !== void 0) {
                                                                                                                                                                                                                                                                const _errs144 = errors;
                                                                                                                                                                                                                                                                if (!validate12(data.targetX, { instancePath: instancePath + "/targetX", parentData: data, parentDataProperty: "targetX", rootData })) {
                                                                                                                                                                                                                                                                  vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
                                                                                                                                                                                                                                                                  errors = vErrors.length;
                                                                                                                                                                                                                                                                }
                                                                                                                                                                                                                                                                var valid0 = _errs144 === errors;
                                                                                                                                                                                                                                                              } else {
                                                                                                                                                                                                                                                                var valid0 = true;
                                                                                                                                                                                                                                                              }
                                                                                                                                                                                                                                                              if (valid0) {
                                                                                                                                                                                                                                                                if (data.targetY !== void 0) {
                                                                                                                                                                                                                                                                  const _errs145 = errors;
                                                                                                                                                                                                                                                                  if (!validate12(data.targetY, { instancePath: instancePath + "/targetY", parentData: data, parentDataProperty: "targetY", rootData })) {
                                                                                                                                                                                                                                                                    vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
                                                                                                                                                                                                                                                                    errors = vErrors.length;
                                                                                                                                                                                                                                                                  }
                                                                                                                                                                                                                                                                  var valid0 = _errs145 === errors;
                                                                                                                                                                                                                                                                } else {
                                                                                                                                                                                                                                                                  var valid0 = true;
                                                                                                                                                                                                                                                                }
                                                                                                                                                                                                                                                                if (valid0) {
                                                                                                                                                                                                                                                                  if (data["text-anchor"] !== void 0) {
                                                                                                                                                                                                                                                                    const _errs146 = errors;
                                                                                                                                                                                                                                                                    if (!validate12(data["text-anchor"], { instancePath: instancePath + "/text-anchor", parentData: data, parentDataProperty: "text-anchor", rootData })) {
                                                                                                                                                                                                                                                                      vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
                                                                                                                                                                                                                                                                      errors = vErrors.length;
                                                                                                                                                                                                                                                                    }
                                                                                                                                                                                                                                                                    var valid0 = _errs146 === errors;
                                                                                                                                                                                                                                                                  } else {
                                                                                                                                                                                                                                                                    var valid0 = true;
                                                                                                                                                                                                                                                                  }
                                                                                                                                                                                                                                                                  if (valid0) {
                                                                                                                                                                                                                                                                    if (data["text-decoration"] !== void 0) {
                                                                                                                                                                                                                                                                      const _errs147 = errors;
                                                                                                                                                                                                                                                                      if (!validate12(data["text-decoration"], { instancePath: instancePath + "/text-decoration", parentData: data, parentDataProperty: "text-decoration", rootData })) {
                                                                                                                                                                                                                                                                        vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
                                                                                                                                                                                                                                                                        errors = vErrors.length;
                                                                                                                                                                                                                                                                      }
                                                                                                                                                                                                                                                                      var valid0 = _errs147 === errors;
                                                                                                                                                                                                                                                                    } else {
                                                                                                                                                                                                                                                                      var valid0 = true;
                                                                                                                                                                                                                                                                    }
                                                                                                                                                                                                                                                                    if (valid0) {
                                                                                                                                                                                                                                                                      if (data["text-rendering"] !== void 0) {
                                                                                                                                                                                                                                                                        const _errs148 = errors;
                                                                                                                                                                                                                                                                        if (!validate12(data["text-rendering"], { instancePath: instancePath + "/text-rendering", parentData: data, parentDataProperty: "text-rendering", rootData })) {
                                                                                                                                                                                                                                                                          vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
                                                                                                                                                                                                                                                                          errors = vErrors.length;
                                                                                                                                                                                                                                                                        }
                                                                                                                                                                                                                                                                        var valid0 = _errs148 === errors;
                                                                                                                                                                                                                                                                      } else {
                                                                                                                                                                                                                                                                        var valid0 = true;
                                                                                                                                                                                                                                                                      }
                                                                                                                                                                                                                                                                      if (valid0) {
                                                                                                                                                                                                                                                                        if (data.textLength !== void 0) {
                                                                                                                                                                                                                                                                          const _errs149 = errors;
                                                                                                                                                                                                                                                                          if (!validate12(data.textLength, { instancePath: instancePath + "/textLength", parentData: data, parentDataProperty: "textLength", rootData })) {
                                                                                                                                                                                                                                                                            vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
                                                                                                                                                                                                                                                                            errors = vErrors.length;
                                                                                                                                                                                                                                                                          }
                                                                                                                                                                                                                                                                          var valid0 = _errs149 === errors;
                                                                                                                                                                                                                                                                        } else {
                                                                                                                                                                                                                                                                          var valid0 = true;
                                                                                                                                                                                                                                                                        }
                                                                                                                                                                                                                                                                        if (valid0) {
                                                                                                                                                                                                                                                                          if (data.transform !== void 0) {
                                                                                                                                                                                                                                                                            const _errs150 = errors;
                                                                                                                                                                                                                                                                            if (!validate12(data.transform, { instancePath: instancePath + "/transform", parentData: data, parentDataProperty: "transform", rootData })) {
                                                                                                                                                                                                                                                                              vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
                                                                                                                                                                                                                                                                              errors = vErrors.length;
                                                                                                                                                                                                                                                                            }
                                                                                                                                                                                                                                                                            var valid0 = _errs150 === errors;
                                                                                                                                                                                                                                                                          } else {
                                                                                                                                                                                                                                                                            var valid0 = true;
                                                                                                                                                                                                                                                                          }
                                                                                                                                                                                                                                                                          if (valid0) {
                                                                                                                                                                                                                                                                            if (data["transform-origin"] !== void 0) {
                                                                                                                                                                                                                                                                              const _errs151 = errors;
                                                                                                                                                                                                                                                                              if (!validate12(data["transform-origin"], { instancePath: instancePath + "/transform-origin", parentData: data, parentDataProperty: "transform-origin", rootData })) {
                                                                                                                                                                                                                                                                                vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
                                                                                                                                                                                                                                                                                errors = vErrors.length;
                                                                                                                                                                                                                                                                              }
                                                                                                                                                                                                                                                                              var valid0 = _errs151 === errors;
                                                                                                                                                                                                                                                                            } else {
                                                                                                                                                                                                                                                                              var valid0 = true;
                                                                                                                                                                                                                                                                            }
                                                                                                                                                                                                                                                                            if (valid0) {
                                                                                                                                                                                                                                                                              if (data.type !== void 0) {
                                                                                                                                                                                                                                                                                const _errs152 = errors;
                                                                                                                                                                                                                                                                                if (!validate12(data.type, { instancePath: instancePath + "/type", parentData: data, parentDataProperty: "type", rootData })) {
                                                                                                                                                                                                                                                                                  vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
                                                                                                                                                                                                                                                                                  errors = vErrors.length;
                                                                                                                                                                                                                                                                                }
                                                                                                                                                                                                                                                                                var valid0 = _errs152 === errors;
                                                                                                                                                                                                                                                                              } else {
                                                                                                                                                                                                                                                                                var valid0 = true;
                                                                                                                                                                                                                                                                              }
                                                                                                                                                                                                                                                                              if (valid0) {
                                                                                                                                                                                                                                                                                if (data.values !== void 0) {
                                                                                                                                                                                                                                                                                  const _errs153 = errors;
                                                                                                                                                                                                                                                                                  if (!validate12(data.values, { instancePath: instancePath + "/values", parentData: data, parentDataProperty: "values", rootData })) {
                                                                                                                                                                                                                                                                                    vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
                                                                                                                                                                                                                                                                                    errors = vErrors.length;
                                                                                                                                                                                                                                                                                  }
                                                                                                                                                                                                                                                                                  var valid0 = _errs153 === errors;
                                                                                                                                                                                                                                                                                } else {
                                                                                                                                                                                                                                                                                  var valid0 = true;
                                                                                                                                                                                                                                                                                }
                                                                                                                                                                                                                                                                                if (valid0) {
                                                                                                                                                                                                                                                                                  if (data.viewBox !== void 0) {
                                                                                                                                                                                                                                                                                    const _errs154 = errors;
                                                                                                                                                                                                                                                                                    if (!validate12(data.viewBox, { instancePath: instancePath + "/viewBox", parentData: data, parentDataProperty: "viewBox", rootData })) {
                                                                                                                                                                                                                                                                                      vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
                                                                                                                                                                                                                                                                                      errors = vErrors.length;
                                                                                                                                                                                                                                                                                    }
                                                                                                                                                                                                                                                                                    var valid0 = _errs154 === errors;
                                                                                                                                                                                                                                                                                  } else {
                                                                                                                                                                                                                                                                                    var valid0 = true;
                                                                                                                                                                                                                                                                                  }
                                                                                                                                                                                                                                                                                  if (valid0) {
                                                                                                                                                                                                                                                                                    if (data.visibility !== void 0) {
                                                                                                                                                                                                                                                                                      const _errs155 = errors;
                                                                                                                                                                                                                                                                                      if (!validate12(data.visibility, { instancePath: instancePath + "/visibility", parentData: data, parentDataProperty: "visibility", rootData })) {
                                                                                                                                                                                                                                                                                        vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
                                                                                                                                                                                                                                                                                        errors = vErrors.length;
                                                                                                                                                                                                                                                                                      }
                                                                                                                                                                                                                                                                                      var valid0 = _errs155 === errors;
                                                                                                                                                                                                                                                                                    } else {
                                                                                                                                                                                                                                                                                      var valid0 = true;
                                                                                                                                                                                                                                                                                    }
                                                                                                                                                                                                                                                                                    if (valid0) {
                                                                                                                                                                                                                                                                                      if (data.width !== void 0) {
                                                                                                                                                                                                                                                                                        const _errs156 = errors;
                                                                                                                                                                                                                                                                                        if (!validate12(data.width, { instancePath: instancePath + "/width", parentData: data, parentDataProperty: "width", rootData })) {
                                                                                                                                                                                                                                                                                          vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
                                                                                                                                                                                                                                                                                          errors = vErrors.length;
                                                                                                                                                                                                                                                                                        }
                                                                                                                                                                                                                                                                                        var valid0 = _errs156 === errors;
                                                                                                                                                                                                                                                                                      } else {
                                                                                                                                                                                                                                                                                        var valid0 = true;
                                                                                                                                                                                                                                                                                      }
                                                                                                                                                                                                                                                                                      if (valid0) {
                                                                                                                                                                                                                                                                                        if (data["word-spacing"] !== void 0) {
                                                                                                                                                                                                                                                                                          const _errs157 = errors;
                                                                                                                                                                                                                                                                                          if (!validate12(data["word-spacing"], { instancePath: instancePath + "/word-spacing", parentData: data, parentDataProperty: "word-spacing", rootData })) {
                                                                                                                                                                                                                                                                                            vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
                                                                                                                                                                                                                                                                                            errors = vErrors.length;
                                                                                                                                                                                                                                                                                          }
                                                                                                                                                                                                                                                                                          var valid0 = _errs157 === errors;
                                                                                                                                                                                                                                                                                        } else {
                                                                                                                                                                                                                                                                                          var valid0 = true;
                                                                                                                                                                                                                                                                                        }
                                                                                                                                                                                                                                                                                        if (valid0) {
                                                                                                                                                                                                                                                                                          if (data["writing-mode"] !== void 0) {
                                                                                                                                                                                                                                                                                            const _errs158 = errors;
                                                                                                                                                                                                                                                                                            if (!validate12(data["writing-mode"], { instancePath: instancePath + "/writing-mode", parentData: data, parentDataProperty: "writing-mode", rootData })) {
                                                                                                                                                                                                                                                                                              vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
                                                                                                                                                                                                                                                                                              errors = vErrors.length;
                                                                                                                                                                                                                                                                                            }
                                                                                                                                                                                                                                                                                            var valid0 = _errs158 === errors;
                                                                                                                                                                                                                                                                                          } else {
                                                                                                                                                                                                                                                                                            var valid0 = true;
                                                                                                                                                                                                                                                                                          }
                                                                                                                                                                                                                                                                                          if (valid0) {
                                                                                                                                                                                                                                                                                            if (data.x !== void 0) {
                                                                                                                                                                                                                                                                                              const _errs159 = errors;
                                                                                                                                                                                                                                                                                              if (!validate12(data.x, { instancePath: instancePath + "/x", parentData: data, parentDataProperty: "x", rootData })) {
                                                                                                                                                                                                                                                                                                vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
                                                                                                                                                                                                                                                                                                errors = vErrors.length;
                                                                                                                                                                                                                                                                                              }
                                                                                                                                                                                                                                                                                              var valid0 = _errs159 === errors;
                                                                                                                                                                                                                                                                                            } else {
                                                                                                                                                                                                                                                                                              var valid0 = true;
                                                                                                                                                                                                                                                                                            }
                                                                                                                                                                                                                                                                                            if (valid0) {
                                                                                                                                                                                                                                                                                              if (data.x1 !== void 0) {
                                                                                                                                                                                                                                                                                                const _errs160 = errors;
                                                                                                                                                                                                                                                                                                if (!validate12(data.x1, { instancePath: instancePath + "/x1", parentData: data, parentDataProperty: "x1", rootData })) {
                                                                                                                                                                                                                                                                                                  vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
                                                                                                                                                                                                                                                                                                  errors = vErrors.length;
                                                                                                                                                                                                                                                                                                }
                                                                                                                                                                                                                                                                                                var valid0 = _errs160 === errors;
                                                                                                                                                                                                                                                                                              } else {
                                                                                                                                                                                                                                                                                                var valid0 = true;
                                                                                                                                                                                                                                                                                              }
                                                                                                                                                                                                                                                                                              if (valid0) {
                                                                                                                                                                                                                                                                                                if (data.x2 !== void 0) {
                                                                                                                                                                                                                                                                                                  const _errs161 = errors;
                                                                                                                                                                                                                                                                                                  if (!validate12(data.x2, { instancePath: instancePath + "/x2", parentData: data, parentDataProperty: "x2", rootData })) {
                                                                                                                                                                                                                                                                                                    vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
                                                                                                                                                                                                                                                                                                    errors = vErrors.length;
                                                                                                                                                                                                                                                                                                  }
                                                                                                                                                                                                                                                                                                  var valid0 = _errs161 === errors;
                                                                                                                                                                                                                                                                                                } else {
                                                                                                                                                                                                                                                                                                  var valid0 = true;
                                                                                                                                                                                                                                                                                                }
                                                                                                                                                                                                                                                                                                if (valid0) {
                                                                                                                                                                                                                                                                                                  if (data.xChannelSelector !== void 0) {
                                                                                                                                                                                                                                                                                                    const _errs162 = errors;
                                                                                                                                                                                                                                                                                                    if (!validate12(data.xChannelSelector, { instancePath: instancePath + "/xChannelSelector", parentData: data, parentDataProperty: "xChannelSelector", rootData })) {
                                                                                                                                                                                                                                                                                                      vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
                                                                                                                                                                                                                                                                                                      errors = vErrors.length;
                                                                                                                                                                                                                                                                                                    }
                                                                                                                                                                                                                                                                                                    var valid0 = _errs162 === errors;
                                                                                                                                                                                                                                                                                                  } else {
                                                                                                                                                                                                                                                                                                    var valid0 = true;
                                                                                                                                                                                                                                                                                                  }
                                                                                                                                                                                                                                                                                                  if (valid0) {
                                                                                                                                                                                                                                                                                                    if (data.y !== void 0) {
                                                                                                                                                                                                                                                                                                      const _errs163 = errors;
                                                                                                                                                                                                                                                                                                      if (!validate12(data.y, { instancePath: instancePath + "/y", parentData: data, parentDataProperty: "y", rootData })) {
                                                                                                                                                                                                                                                                                                        vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
                                                                                                                                                                                                                                                                                                        errors = vErrors.length;
                                                                                                                                                                                                                                                                                                      }
                                                                                                                                                                                                                                                                                                      var valid0 = _errs163 === errors;
                                                                                                                                                                                                                                                                                                    } else {
                                                                                                                                                                                                                                                                                                      var valid0 = true;
                                                                                                                                                                                                                                                                                                    }
                                                                                                                                                                                                                                                                                                    if (valid0) {
                                                                                                                                                                                                                                                                                                      if (data.y1 !== void 0) {
                                                                                                                                                                                                                                                                                                        const _errs164 = errors;
                                                                                                                                                                                                                                                                                                        if (!validate12(data.y1, { instancePath: instancePath + "/y1", parentData: data, parentDataProperty: "y1", rootData })) {
                                                                                                                                                                                                                                                                                                          vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
                                                                                                                                                                                                                                                                                                          errors = vErrors.length;
                                                                                                                                                                                                                                                                                                        }
                                                                                                                                                                                                                                                                                                        var valid0 = _errs164 === errors;
                                                                                                                                                                                                                                                                                                      } else {
                                                                                                                                                                                                                                                                                                        var valid0 = true;
                                                                                                                                                                                                                                                                                                      }
                                                                                                                                                                                                                                                                                                      if (valid0) {
                                                                                                                                                                                                                                                                                                        if (data.y2 !== void 0) {
                                                                                                                                                                                                                                                                                                          const _errs165 = errors;
                                                                                                                                                                                                                                                                                                          if (!validate12(data.y2, { instancePath: instancePath + "/y2", parentData: data, parentDataProperty: "y2", rootData })) {
                                                                                                                                                                                                                                                                                                            vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
                                                                                                                                                                                                                                                                                                            errors = vErrors.length;
                                                                                                                                                                                                                                                                                                          }
                                                                                                                                                                                                                                                                                                          var valid0 = _errs165 === errors;
                                                                                                                                                                                                                                                                                                        } else {
                                                                                                                                                                                                                                                                                                          var valid0 = true;
                                                                                                                                                                                                                                                                                                        }
                                                                                                                                                                                                                                                                                                        if (valid0) {
                                                                                                                                                                                                                                                                                                          if (data.yChannelSelector !== void 0) {
                                                                                                                                                                                                                                                                                                            const _errs166 = errors;
                                                                                                                                                                                                                                                                                                            if (!validate12(data.yChannelSelector, { instancePath: instancePath + "/yChannelSelector", parentData: data, parentDataProperty: "yChannelSelector", rootData })) {
                                                                                                                                                                                                                                                                                                              vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
                                                                                                                                                                                                                                                                                                              errors = vErrors.length;
                                                                                                                                                                                                                                                                                                            }
                                                                                                                                                                                                                                                                                                            var valid0 = _errs166 === errors;
                                                                                                                                                                                                                                                                                                          } else {
                                                                                                                                                                                                                                                                                                            var valid0 = true;
                                                                                                                                                                                                                                                                                                          }
                                                                                                                                                                                                                                                                                                          if (valid0) {
                                                                                                                                                                                                                                                                                                            if (data.z !== void 0) {
                                                                                                                                                                                                                                                                                                              const _errs167 = errors;
                                                                                                                                                                                                                                                                                                              if (!validate12(data.z, { instancePath: instancePath + "/z", parentData: data, parentDataProperty: "z", rootData })) {
                                                                                                                                                                                                                                                                                                                vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
                                                                                                                                                                                                                                                                                                                errors = vErrors.length;
                                                                                                                                                                                                                                                                                                              }
                                                                                                                                                                                                                                                                                                              var valid0 = _errs167 === errors;
                                                                                                                                                                                                                                                                                                            } else {
                                                                                                                                                                                                                                                                                                              var valid0 = true;
                                                                                                                                                                                                                                                                                                            }
                                                                                                                                                                                                                                                                                                          }
                                                                                                                                                                                                                                                                                                        }
                                                                                                                                                                                                                                                                                                      }
                                                                                                                                                                                                                                                                                                    }
                                                                                                                                                                                                                                                                                                  }
                                                                                                                                                                                                                                                                                                }
                                                                                                                                                                                                                                                                                              }
                                                                                                                                                                                                                                                                                            }
                                                                                                                                                                                                                                                                                          }
                                                                                                                                                                                                                                                                                        }
                                                                                                                                                                                                                                                                                      }
                                                                                                                                                                                                                                                                                    }
                                                                                                                                                                                                                                                                                  }
                                                                                                                                                                                                                                                                                }
                                                                                                                                                                                                                                                                              }
                                                                                                                                                                                                                                                                            }
                                                                                                                                                                                                                                                                          }
                                                                                                                                                                                                                                                                        }
                                                                                                                                                                                                                                                                      }
                                                                                                                                                                                                                                                                    }
                                                                                                                                                                                                                                                                  }
                                                                                                                                                                                                                                                                }
                                                                                                                                                                                                                                                              }
                                                                                                                                                                                                                                                            }
                                                                                                                                                                                                                                                          }
                                                                                                                                                                                                                                                        }
                                                                                                                                                                                                                                                      }
                                                                                                                                                                                                                                                    }
                                                                                                                                                                                                                                                  }
                                                                                                                                                                                                                                                }
                                                                                                                                                                                                                                              }
                                                                                                                                                                                                                                            }
                                                                                                                                                                                                                                          }
                                                                                                                                                                                                                                        }
                                                                                                                                                                                                                                      }
                                                                                                                                                                                                                                    }
                                                                                                                                                                                                                                  }
                                                                                                                                                                                                                                }
                                                                                                                                                                                                                              }
                                                                                                                                                                                                                            }
                                                                                                                                                                                                                          }
                                                                                                                                                                                                                        }
                                                                                                                                                                                                                      }
                                                                                                                                                                                                                    }
                                                                                                                                                                                                                  }
                                                                                                                                                                                                                }
                                                                                                                                                                                                              }
                                                                                                                                                                                                            }
                                                                                                                                                                                                          }
                                                                                                                                                                                                        }
                                                                                                                                                                                                      }
                                                                                                                                                                                                    }
                                                                                                                                                                                                  }
                                                                                                                                                                                                }
                                                                                                                                                                                              }
                                                                                                                                                                                            }
                                                                                                                                                                                          }
                                                                                                                                                                                        }
                                                                                                                                                                                      }
                                                                                                                                                                                    }
                                                                                                                                                                                  }
                                                                                                                                                                                }
                                                                                                                                                                              }
                                                                                                                                                                            }
                                                                                                                                                                          }
                                                                                                                                                                        }
                                                                                                                                                                      }
                                                                                                                                                                    }
                                                                                                                                                                  }
                                                                                                                                                                }
                                                                                                                                                              }
                                                                                                                                                            }
                                                                                                                                                          }
                                                                                                                                                        }
                                                                                                                                                      }
                                                                                                                                                    }
                                                                                                                                                  }
                                                                                                                                                }
                                                                                                                                              }
                                                                                                                                            }
                                                                                                                                          }
                                                                                                                                        }
                                                                                                                                      }
                                                                                                                                    }
                                                                                                                                  }
                                                                                                                                }
                                                                                                                              }
                                                                                                                            }
                                                                                                                          }
                                                                                                                        }
                                                                                                                      }
                                                                                                                    }
                                                                                                                  }
                                                                                                                }
                                                                                                              }
                                                                                                            }
                                                                                                          }
                                                                                                        }
                                                                                                      }
                                                                                                    }
                                                                                                  }
                                                                                                }
                                                                                              }
                                                                                            }
                                                                                          }
                                                                                        }
                                                                                      }
                                                                                    }
                                                                                  }
                                                                                }
                                                                              }
                                                                            }
                                                                          }
                                                                        }
                                                                      }
                                                                    }
                                                                  }
                                                                }
                                                              }
                                                            }
                                                          }
                                                        }
                                                      }
                                                    }
                                                  }
                                                }
                                              }
                                            }
                                          }
                                        }
                                      }
                                    }
                                  }
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    } else {
      validate11.errors = [{ instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" }];
      return false;
    }
  }
  validate11.errors = vErrors;
  return errors === 0;
}
var schema26 = { "description": "A raw text node. Its `value` becomes the text content rendered into the parent element.", "type": "object", "properties": { "type": { "const": "text" }, "value": { "description": "Either a plain string, or a `variable` reference resolved at render time to the seed's initials.", "anyOf": [{ "type": "string", "maxLength": 4096 }, { "type": "object", "properties": { "type": { "const": "variable" }, "name": { "enum": ["initial", "initials"] } }, "required": ["type", "name"], "additionalProperties": false }] } }, "required": ["type", "value"], "additionalProperties": false };
function validate168(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  const _errs1 = errors;
  if (errors === _errs1) {
    if (typeof data === "string") {
      if (func2(data) > 64) {
        validate168.errors = [{ instancePath, schemaPath: "#/definitions/camelCaseName/maxLength", keyword: "maxLength", params: { limit: 64 }, message: "must NOT have more than 64 characters" }];
        return false;
      } else {
        if (!pattern10.test(data)) {
          validate168.errors = [{ instancePath, schemaPath: "#/definitions/camelCaseName/pattern", keyword: "pattern", params: { pattern: "^[a-z][a-zA-Z0-9]*$" }, message: 'must match pattern "^[a-z][a-zA-Z0-9]*$"' }];
          return false;
        }
      }
    } else {
      validate168.errors = [{ instancePath, schemaPath: "#/definitions/camelCaseName/type", keyword: "type", params: { type: "string" }, message: "must be string" }];
      return false;
    }
  }
  validate168.errors = vErrors;
  return errors === 0;
}
function validate167(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  if (errors === 0) {
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing0;
      if (data.type === void 0 && (missing0 = "type") || data.name === void 0 && (missing0 = "name")) {
        validate167.errors = [{ instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: missing0 }, message: "must have required property '" + missing0 + "'" }];
        return false;
      } else {
        const _errs1 = errors;
        for (const key0 in data) {
          if (!(key0 === "type" || key0 === "name" || key0 === "attributes")) {
            validate167.errors = [{ instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" }];
            return false;
            break;
          }
        }
        if (_errs1 === errors) {
          if (data.type !== void 0) {
            const _errs2 = errors;
            if ("component" !== data.type) {
              validate167.errors = [{ instancePath: instancePath + "/type", schemaPath: "#/properties/type/const", keyword: "const", params: { allowedValue: "component" }, message: "must be equal to constant" }];
              return false;
            }
            var valid0 = _errs2 === errors;
          } else {
            var valid0 = true;
          }
          if (valid0) {
            if (data.name !== void 0) {
              const _errs3 = errors;
              if (!validate168(data.name, { instancePath: instancePath + "/name", parentData: data, parentDataProperty: "name", rootData })) {
                vErrors = vErrors === null ? validate168.errors : vErrors.concat(validate168.errors);
                errors = vErrors.length;
              }
              var valid0 = _errs3 === errors;
            } else {
              var valid0 = true;
            }
            if (valid0) {
              if (data.attributes !== void 0) {
                const _errs4 = errors;
                if (!validate11(data.attributes, { instancePath: instancePath + "/attributes", parentData: data, parentDataProperty: "attributes", rootData })) {
                  vErrors = vErrors === null ? validate11.errors : vErrors.concat(validate11.errors);
                  errors = vErrors.length;
                }
                var valid0 = _errs4 === errors;
              } else {
                var valid0 = true;
              }
            }
          }
        }
      }
    } else {
      validate167.errors = [{ instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" }];
      return false;
    }
  }
  validate167.errors = vErrors;
  return errors === 0;
}
function validate172(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  if (errors === 0) {
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing0;
      if (data.type === void 0 && (missing0 = "type") || data.name === void 0 && (missing0 = "name")) {
        validate172.errors = [{ instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: missing0 }, message: "must have required property '" + missing0 + "'" }];
        return false;
      } else {
        const _errs1 = errors;
        for (const key0 in data) {
          if (!(key0 === "type" || key0 === "name" || key0 === "attributes" || key0 === "children")) {
            validate172.errors = [{ instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" }];
            return false;
            break;
          }
        }
        if (_errs1 === errors) {
          if (data.type !== void 0) {
            const _errs2 = errors;
            if ("element" !== data.type) {
              validate172.errors = [{ instancePath: instancePath + "/type", schemaPath: "#/properties/type/const", keyword: "const", params: { allowedValue: "element" }, message: "must be equal to constant" }];
              return false;
            }
            var valid0 = _errs2 === errors;
          } else {
            var valid0 = true;
          }
          if (valid0) {
            if (data.name !== void 0) {
              const _errs3 = errors;
              if ("style" !== data.name) {
                validate172.errors = [{ instancePath: instancePath + "/name", schemaPath: "#/properties/name/const", keyword: "const", params: { allowedValue: "style" }, message: "must be equal to constant" }];
                return false;
              }
              var valid0 = _errs3 === errors;
            } else {
              var valid0 = true;
            }
            if (valid0) {
              if (data.attributes !== void 0) {
                const _errs4 = errors;
                if (!validate11(data.attributes, { instancePath: instancePath + "/attributes", parentData: data, parentDataProperty: "attributes", rootData })) {
                  vErrors = vErrors === null ? validate11.errors : vErrors.concat(validate11.errors);
                  errors = vErrors.length;
                }
                var valid0 = _errs4 === errors;
              } else {
                var valid0 = true;
              }
              if (valid0) {
                if (data.children !== void 0) {
                  let data3 = data.children;
                  const _errs5 = errors;
                  if (errors === _errs5) {
                    if (Array.isArray(data3)) {
                      if (data3.length > 64) {
                        validate172.errors = [{ instancePath: instancePath + "/children", schemaPath: "#/properties/children/maxItems", keyword: "maxItems", params: { limit: 64 }, message: "must NOT have more than 64 items" }];
                        return false;
                      } else {
                        var valid1 = true;
                        const len0 = data3.length;
                        for (let i0 = 0; i0 < len0; i0++) {
                          let data4 = data3[i0];
                          const _errs7 = errors;
                          if (errors === _errs7) {
                            if (data4 && typeof data4 == "object" && !Array.isArray(data4)) {
                              let missing1;
                              if (data4.type === void 0 && (missing1 = "type") || data4.value === void 0 && (missing1 = "value")) {
                                validate172.errors = [{ instancePath: instancePath + "/children/" + i0, schemaPath: "#/properties/children/items/required", keyword: "required", params: { missingProperty: missing1 }, message: "must have required property '" + missing1 + "'" }];
                                return false;
                              } else {
                                const _errs9 = errors;
                                for (const key1 in data4) {
                                  if (!(key1 === "type" || key1 === "value")) {
                                    validate172.errors = [{ instancePath: instancePath + "/children/" + i0, schemaPath: "#/properties/children/items/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" }];
                                    return false;
                                    break;
                                  }
                                }
                                if (_errs9 === errors) {
                                  if (data4.type !== void 0) {
                                    const _errs10 = errors;
                                    if ("text" !== data4.type) {
                                      validate172.errors = [{ instancePath: instancePath + "/children/" + i0 + "/type", schemaPath: "#/properties/children/items/properties/type/const", keyword: "const", params: { allowedValue: "text" }, message: "must be equal to constant" }];
                                      return false;
                                    }
                                    var valid2 = _errs10 === errors;
                                  } else {
                                    var valid2 = true;
                                  }
                                  if (valid2) {
                                    if (data4.value !== void 0) {
                                      const _errs11 = errors;
                                      if (!validate135(data4.value, { instancePath: instancePath + "/children/" + i0 + "/value", parentData: data4, parentDataProperty: "value", rootData })) {
                                        vErrors = vErrors === null ? validate135.errors : vErrors.concat(validate135.errors);
                                        errors = vErrors.length;
                                      }
                                      var valid2 = _errs11 === errors;
                                    } else {
                                      var valid2 = true;
                                    }
                                  }
                                }
                              }
                            } else {
                              validate172.errors = [{ instancePath: instancePath + "/children/" + i0, schemaPath: "#/properties/children/items/type", keyword: "type", params: { type: "object" }, message: "must be object" }];
                              return false;
                            }
                          }
                          var valid1 = _errs7 === errors;
                          if (!valid1) {
                            break;
                          }
                        }
                      }
                    } else {
                      validate172.errors = [{ instancePath: instancePath + "/children", schemaPath: "#/properties/children/type", keyword: "type", params: { type: "array" }, message: "must be array" }];
                      return false;
                    }
                  }
                  var valid0 = _errs5 === errors;
                } else {
                  var valid0 = true;
                }
              }
            }
          }
        }
      }
    } else {
      validate172.errors = [{ instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" }];
      return false;
    }
  }
  validate172.errors = vErrors;
  return errors === 0;
}
var schema31 = { "description": "Any SVG element other than `<style>`, which has its own stricter content policy.", "type": "object", "properties": { "type": { "const": "element" }, "name": { "description": "The SVG tag name. Only a safe subset of SVG elements is permitted; dangerous elements such as `script`, `foreignObject`, or `a` are excluded.", "enum": ["circle", "clipPath", "defs", "desc", "ellipse", "feBlend", "feColorMatrix", "feComponentTransfer", "feComposite", "feConvolveMatrix", "feDiffuseLighting", "feDisplacementMap", "feDistantLight", "feDropShadow", "feFlood", "feFuncA", "feFuncB", "feFuncG", "feFuncR", "feGaussianBlur", "feImage", "feMerge", "feMergeNode", "feMorphology", "feOffset", "fePointLight", "feSpecularLighting", "feSpotLight", "feTile", "feTurbulence", "filter", "g", "image", "line", "linearGradient", "marker", "mask", "metadata", "mpath", "path", "pattern", "polygon", "polyline", "radialGradient", "rect", "stop", "svg", "switch", "symbol", "text", "textPath", "title", "tspan", "use", "view"] }, "attributes": { "$ref": "#/definitions/attributes" }, "children": { "type": "array", "items": { "$ref": "#/definitions/element" }, "maxItems": 1024 } }, "required": ["type", "name"], "additionalProperties": false };
var wrapper0 = { validate: validate166 };
function validate176(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  if (errors === 0) {
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing0;
      if (data.type === void 0 && (missing0 = "type") || data.name === void 0 && (missing0 = "name")) {
        validate176.errors = [{ instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: missing0 }, message: "must have required property '" + missing0 + "'" }];
        return false;
      } else {
        const _errs1 = errors;
        for (const key0 in data) {
          if (!(key0 === "type" || key0 === "name" || key0 === "attributes" || key0 === "children")) {
            validate176.errors = [{ instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" }];
            return false;
            break;
          }
        }
        if (_errs1 === errors) {
          if (data.type !== void 0) {
            const _errs2 = errors;
            if ("element" !== data.type) {
              validate176.errors = [{ instancePath: instancePath + "/type", schemaPath: "#/properties/type/const", keyword: "const", params: { allowedValue: "element" }, message: "must be equal to constant" }];
              return false;
            }
            var valid0 = _errs2 === errors;
          } else {
            var valid0 = true;
          }
          if (valid0) {
            if (data.name !== void 0) {
              let data1 = data.name;
              const _errs3 = errors;
              if (!(data1 === "circle" || data1 === "clipPath" || data1 === "defs" || data1 === "desc" || data1 === "ellipse" || data1 === "feBlend" || data1 === "feColorMatrix" || data1 === "feComponentTransfer" || data1 === "feComposite" || data1 === "feConvolveMatrix" || data1 === "feDiffuseLighting" || data1 === "feDisplacementMap" || data1 === "feDistantLight" || data1 === "feDropShadow" || data1 === "feFlood" || data1 === "feFuncA" || data1 === "feFuncB" || data1 === "feFuncG" || data1 === "feFuncR" || data1 === "feGaussianBlur" || data1 === "feImage" || data1 === "feMerge" || data1 === "feMergeNode" || data1 === "feMorphology" || data1 === "feOffset" || data1 === "fePointLight" || data1 === "feSpecularLighting" || data1 === "feSpotLight" || data1 === "feTile" || data1 === "feTurbulence" || data1 === "filter" || data1 === "g" || data1 === "image" || data1 === "line" || data1 === "linearGradient" || data1 === "marker" || data1 === "mask" || data1 === "metadata" || data1 === "mpath" || data1 === "path" || data1 === "pattern" || data1 === "polygon" || data1 === "polyline" || data1 === "radialGradient" || data1 === "rect" || data1 === "stop" || data1 === "svg" || data1 === "switch" || data1 === "symbol" || data1 === "text" || data1 === "textPath" || data1 === "title" || data1 === "tspan" || data1 === "use" || data1 === "view")) {
                validate176.errors = [{ instancePath: instancePath + "/name", schemaPath: "#/properties/name/enum", keyword: "enum", params: { allowedValues: schema31.properties.name.enum }, message: "must be equal to one of the allowed values" }];
                return false;
              }
              var valid0 = _errs3 === errors;
            } else {
              var valid0 = true;
            }
            if (valid0) {
              if (data.attributes !== void 0) {
                const _errs4 = errors;
                if (!validate11(data.attributes, { instancePath: instancePath + "/attributes", parentData: data, parentDataProperty: "attributes", rootData })) {
                  vErrors = vErrors === null ? validate11.errors : vErrors.concat(validate11.errors);
                  errors = vErrors.length;
                }
                var valid0 = _errs4 === errors;
              } else {
                var valid0 = true;
              }
              if (valid0) {
                if (data.children !== void 0) {
                  let data3 = data.children;
                  const _errs5 = errors;
                  if (errors === _errs5) {
                    if (Array.isArray(data3)) {
                      if (data3.length > 1024) {
                        validate176.errors = [{ instancePath: instancePath + "/children", schemaPath: "#/properties/children/maxItems", keyword: "maxItems", params: { limit: 1024 }, message: "must NOT have more than 1024 items" }];
                        return false;
                      } else {
                        var valid1 = true;
                        const len0 = data3.length;
                        for (let i0 = 0; i0 < len0; i0++) {
                          const _errs7 = errors;
                          if (!wrapper0.validate(data3[i0], { instancePath: instancePath + "/children/" + i0, parentData: data3, parentDataProperty: i0, rootData })) {
                            vErrors = vErrors === null ? wrapper0.validate.errors : vErrors.concat(wrapper0.validate.errors);
                            errors = vErrors.length;
                          }
                          var valid1 = _errs7 === errors;
                          if (!valid1) {
                            break;
                          }
                        }
                      }
                    } else {
                      validate176.errors = [{ instancePath: instancePath + "/children", schemaPath: "#/properties/children/type", keyword: "type", params: { type: "array" }, message: "must be array" }];
                      return false;
                    }
                  }
                  var valid0 = _errs5 === errors;
                } else {
                  var valid0 = true;
                }
              }
            }
          }
        }
      }
    } else {
      validate176.errors = [{ instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" }];
      return false;
    }
  }
  validate176.errors = vErrors;
  return errors === 0;
}
function validate166(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  const _errs0 = errors;
  let valid0 = false;
  const _errs1 = errors;
  const _errs2 = errors;
  if (errors === _errs2) {
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing0;
      if (data.type === void 0 && (missing0 = "type") || data.value === void 0 && (missing0 = "value")) {
        const err0 = { instancePath, schemaPath: "#/definitions/textElement/required", keyword: "required", params: { missingProperty: missing0 }, message: "must have required property '" + missing0 + "'" };
        if (vErrors === null) {
          vErrors = [err0];
        } else {
          vErrors.push(err0);
        }
        errors++;
      } else {
        const _errs4 = errors;
        for (const key0 in data) {
          if (!(key0 === "type" || key0 === "value")) {
            const err1 = { instancePath, schemaPath: "#/definitions/textElement/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err1];
            } else {
              vErrors.push(err1);
            }
            errors++;
            break;
          }
        }
        if (_errs4 === errors) {
          if (data.type !== void 0) {
            const _errs5 = errors;
            if ("text" !== data.type) {
              const err2 = { instancePath: instancePath + "/type", schemaPath: "#/definitions/textElement/properties/type/const", keyword: "const", params: { allowedValue: "text" }, message: "must be equal to constant" };
              if (vErrors === null) {
                vErrors = [err2];
              } else {
                vErrors.push(err2);
              }
              errors++;
            }
            var valid2 = _errs5 === errors;
          } else {
            var valid2 = true;
          }
          if (valid2) {
            if (data.value !== void 0) {
              let data1 = data.value;
              const _errs6 = errors;
              const _errs7 = errors;
              let valid3 = false;
              const _errs8 = errors;
              if (errors === _errs8) {
                if (typeof data1 === "string") {
                  if (func2(data1) > 4096) {
                    const err3 = { instancePath: instancePath + "/value", schemaPath: "#/definitions/textElement/properties/value/anyOf/0/maxLength", keyword: "maxLength", params: { limit: 4096 }, message: "must NOT have more than 4096 characters" };
                    if (vErrors === null) {
                      vErrors = [err3];
                    } else {
                      vErrors.push(err3);
                    }
                    errors++;
                  }
                } else {
                  const err4 = { instancePath: instancePath + "/value", schemaPath: "#/definitions/textElement/properties/value/anyOf/0/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                  if (vErrors === null) {
                    vErrors = [err4];
                  } else {
                    vErrors.push(err4);
                  }
                  errors++;
                }
              }
              var _valid1 = _errs8 === errors;
              valid3 = valid3 || _valid1;
              if (!valid3) {
                const _errs10 = errors;
                if (errors === _errs10) {
                  if (data1 && typeof data1 == "object" && !Array.isArray(data1)) {
                    let missing1;
                    if (data1.type === void 0 && (missing1 = "type") || data1.name === void 0 && (missing1 = "name")) {
                      const err5 = { instancePath: instancePath + "/value", schemaPath: "#/definitions/textElement/properties/value/anyOf/1/required", keyword: "required", params: { missingProperty: missing1 }, message: "must have required property '" + missing1 + "'" };
                      if (vErrors === null) {
                        vErrors = [err5];
                      } else {
                        vErrors.push(err5);
                      }
                      errors++;
                    } else {
                      const _errs12 = errors;
                      for (const key1 in data1) {
                        if (!(key1 === "type" || key1 === "name")) {
                          const err6 = { instancePath: instancePath + "/value", schemaPath: "#/definitions/textElement/properties/value/anyOf/1/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" };
                          if (vErrors === null) {
                            vErrors = [err6];
                          } else {
                            vErrors.push(err6);
                          }
                          errors++;
                          break;
                        }
                      }
                      if (_errs12 === errors) {
                        if (data1.type !== void 0) {
                          const _errs13 = errors;
                          if ("variable" !== data1.type) {
                            const err7 = { instancePath: instancePath + "/value/type", schemaPath: "#/definitions/textElement/properties/value/anyOf/1/properties/type/const", keyword: "const", params: { allowedValue: "variable" }, message: "must be equal to constant" };
                            if (vErrors === null) {
                              vErrors = [err7];
                            } else {
                              vErrors.push(err7);
                            }
                            errors++;
                          }
                          var valid4 = _errs13 === errors;
                        } else {
                          var valid4 = true;
                        }
                        if (valid4) {
                          if (data1.name !== void 0) {
                            let data3 = data1.name;
                            const _errs14 = errors;
                            if (!(data3 === "initial" || data3 === "initials")) {
                              const err8 = { instancePath: instancePath + "/value/name", schemaPath: "#/definitions/textElement/properties/value/anyOf/1/properties/name/enum", keyword: "enum", params: { allowedValues: schema26.properties.value.anyOf[1].properties.name.enum }, message: "must be equal to one of the allowed values" };
                              if (vErrors === null) {
                                vErrors = [err8];
                              } else {
                                vErrors.push(err8);
                              }
                              errors++;
                            }
                            var valid4 = _errs14 === errors;
                          } else {
                            var valid4 = true;
                          }
                        }
                      }
                    }
                  } else {
                    const err9 = { instancePath: instancePath + "/value", schemaPath: "#/definitions/textElement/properties/value/anyOf/1/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                    if (vErrors === null) {
                      vErrors = [err9];
                    } else {
                      vErrors.push(err9);
                    }
                    errors++;
                  }
                }
                var _valid1 = _errs10 === errors;
                valid3 = valid3 || _valid1;
              }
              if (!valid3) {
                const err10 = { instancePath: instancePath + "/value", schemaPath: "#/definitions/textElement/properties/value/anyOf", keyword: "anyOf", params: {}, message: "must match a schema in anyOf" };
                if (vErrors === null) {
                  vErrors = [err10];
                } else {
                  vErrors.push(err10);
                }
                errors++;
              } else {
                errors = _errs7;
                if (vErrors !== null) {
                  if (_errs7) {
                    vErrors.length = _errs7;
                  } else {
                    vErrors = null;
                  }
                }
              }
              var valid2 = _errs6 === errors;
            } else {
              var valid2 = true;
            }
          }
        }
      }
    } else {
      const err11 = { instancePath, schemaPath: "#/definitions/textElement/type", keyword: "type", params: { type: "object" }, message: "must be object" };
      if (vErrors === null) {
        vErrors = [err11];
      } else {
        vErrors.push(err11);
      }
      errors++;
    }
  }
  var _valid0 = _errs1 === errors;
  valid0 = valid0 || _valid0;
  if (!valid0) {
    const _errs15 = errors;
    if (!validate167(data, { instancePath, parentData, parentDataProperty, rootData })) {
      vErrors = vErrors === null ? validate167.errors : vErrors.concat(validate167.errors);
      errors = vErrors.length;
    }
    var _valid0 = _errs15 === errors;
    valid0 = valid0 || _valid0;
    if (!valid0) {
      const _errs16 = errors;
      if (!validate172(data, { instancePath, parentData, parentDataProperty, rootData })) {
        vErrors = vErrors === null ? validate172.errors : vErrors.concat(validate172.errors);
        errors = vErrors.length;
      }
      var _valid0 = _errs16 === errors;
      valid0 = valid0 || _valid0;
      if (!valid0) {
        const _errs17 = errors;
        if (!validate176(data, { instancePath, parentData, parentDataProperty, rootData })) {
          vErrors = vErrors === null ? validate176.errors : vErrors.concat(validate176.errors);
          errors = vErrors.length;
        }
        var _valid0 = _errs17 === errors;
        valid0 = valid0 || _valid0;
      }
    }
  }
  if (!valid0) {
    const err12 = { instancePath, schemaPath: "#/anyOf", keyword: "anyOf", params: {}, message: "must match a schema in anyOf" };
    if (vErrors === null) {
      vErrors = [err12];
    } else {
      vErrors.push(err12);
    }
    errors++;
    validate166.errors = vErrors;
    return false;
  } else {
    errors = _errs0;
    if (vErrors !== null) {
      if (_errs0) {
        vErrors.length = _errs0;
      } else {
        vErrors = null;
      }
    }
  }
  validate166.errors = vErrors;
  return errors === 0;
}
function validate181(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  if (errors === 0) {
    if (data && typeof data == "object" && !Array.isArray(data)) {
      const _errs1 = errors;
      for (const key0 in data) {
        if (!(key0 === "x" || key0 === "y")) {
          validate181.errors = [{ instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" }];
          return false;
          break;
        }
      }
      if (_errs1 === errors) {
        if (data.x !== void 0) {
          let data0 = data.x;
          const _errs2 = errors;
          const _errs3 = errors;
          if (errors === _errs3) {
            if (data0 && typeof data0 == "object" && !Array.isArray(data0)) {
              let missing0;
              if (data0.min === void 0 && (missing0 = "min") || data0.max === void 0 && (missing0 = "max")) {
                validate181.errors = [{ instancePath: instancePath + "/x", schemaPath: "#/definitions/translateValue/required", keyword: "required", params: { missingProperty: missing0 }, message: "must have required property '" + missing0 + "'" }];
                return false;
              } else {
                const _errs5 = errors;
                for (const key1 in data0) {
                  if (!(key1 === "min" || key1 === "max" || key1 === "step")) {
                    validate181.errors = [{ instancePath: instancePath + "/x", schemaPath: "#/definitions/translateValue/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" }];
                    return false;
                    break;
                  }
                }
                if (_errs5 === errors) {
                  if (data0.min !== void 0) {
                    let data1 = data0.min;
                    const _errs6 = errors;
                    if (errors === _errs6) {
                      if (typeof data1 == "number" && isFinite(data1)) {
                        if (data1 > 1e3 || isNaN(data1)) {
                          validate181.errors = [{ instancePath: instancePath + "/x/min", schemaPath: "#/definitions/translateValue/properties/min/maximum", keyword: "maximum", params: { comparison: "<=", limit: 1e3 }, message: "must be <= 1000" }];
                          return false;
                        } else {
                          if (data1 < -1e3 || isNaN(data1)) {
                            validate181.errors = [{ instancePath: instancePath + "/x/min", schemaPath: "#/definitions/translateValue/properties/min/minimum", keyword: "minimum", params: { comparison: ">=", limit: -1e3 }, message: "must be >= -1000" }];
                            return false;
                          }
                        }
                      } else {
                        validate181.errors = [{ instancePath: instancePath + "/x/min", schemaPath: "#/definitions/translateValue/properties/min/type", keyword: "type", params: { type: "number" }, message: "must be number" }];
                        return false;
                      }
                    }
                    var valid2 = _errs6 === errors;
                  } else {
                    var valid2 = true;
                  }
                  if (valid2) {
                    if (data0.max !== void 0) {
                      let data2 = data0.max;
                      const _errs8 = errors;
                      if (errors === _errs8) {
                        if (typeof data2 == "number" && isFinite(data2)) {
                          if (data2 > 1e3 || isNaN(data2)) {
                            validate181.errors = [{ instancePath: instancePath + "/x/max", schemaPath: "#/definitions/translateValue/properties/max/maximum", keyword: "maximum", params: { comparison: "<=", limit: 1e3 }, message: "must be <= 1000" }];
                            return false;
                          } else {
                            if (data2 < -1e3 || isNaN(data2)) {
                              validate181.errors = [{ instancePath: instancePath + "/x/max", schemaPath: "#/definitions/translateValue/properties/max/minimum", keyword: "minimum", params: { comparison: ">=", limit: -1e3 }, message: "must be >= -1000" }];
                              return false;
                            }
                          }
                        } else {
                          validate181.errors = [{ instancePath: instancePath + "/x/max", schemaPath: "#/definitions/translateValue/properties/max/type", keyword: "type", params: { type: "number" }, message: "must be number" }];
                          return false;
                        }
                      }
                      var valid2 = _errs8 === errors;
                    } else {
                      var valid2 = true;
                    }
                    if (valid2) {
                      if (data0.step !== void 0) {
                        let data3 = data0.step;
                        const _errs10 = errors;
                        if (errors === _errs10) {
                          if (typeof data3 == "number" && isFinite(data3)) {
                            if (data3 > 2e3 || isNaN(data3)) {
                              validate181.errors = [{ instancePath: instancePath + "/x/step", schemaPath: "#/definitions/translateValue/properties/step/maximum", keyword: "maximum", params: { comparison: "<=", limit: 2e3 }, message: "must be <= 2000" }];
                              return false;
                            } else {
                              if (data3 <= 0 || isNaN(data3)) {
                                validate181.errors = [{ instancePath: instancePath + "/x/step", schemaPath: "#/definitions/translateValue/properties/step/exclusiveMinimum", keyword: "exclusiveMinimum", params: { comparison: ">", limit: 0 }, message: "must be > 0" }];
                                return false;
                              }
                            }
                          } else {
                            validate181.errors = [{ instancePath: instancePath + "/x/step", schemaPath: "#/definitions/translateValue/properties/step/type", keyword: "type", params: { type: "number" }, message: "must be number" }];
                            return false;
                          }
                        }
                        var valid2 = _errs10 === errors;
                      } else {
                        var valid2 = true;
                      }
                    }
                  }
                }
              }
            } else {
              validate181.errors = [{ instancePath: instancePath + "/x", schemaPath: "#/definitions/translateValue/type", keyword: "type", params: { type: "object" }, message: "must be object" }];
              return false;
            }
          }
          var valid0 = _errs2 === errors;
        } else {
          var valid0 = true;
        }
        if (valid0) {
          if (data.y !== void 0) {
            let data4 = data.y;
            const _errs12 = errors;
            const _errs13 = errors;
            if (errors === _errs13) {
              if (data4 && typeof data4 == "object" && !Array.isArray(data4)) {
                let missing1;
                if (data4.min === void 0 && (missing1 = "min") || data4.max === void 0 && (missing1 = "max")) {
                  validate181.errors = [{ instancePath: instancePath + "/y", schemaPath: "#/definitions/translateValue/required", keyword: "required", params: { missingProperty: missing1 }, message: "must have required property '" + missing1 + "'" }];
                  return false;
                } else {
                  const _errs15 = errors;
                  for (const key2 in data4) {
                    if (!(key2 === "min" || key2 === "max" || key2 === "step")) {
                      validate181.errors = [{ instancePath: instancePath + "/y", schemaPath: "#/definitions/translateValue/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key2 }, message: "must NOT have additional properties" }];
                      return false;
                      break;
                    }
                  }
                  if (_errs15 === errors) {
                    if (data4.min !== void 0) {
                      let data5 = data4.min;
                      const _errs16 = errors;
                      if (errors === _errs16) {
                        if (typeof data5 == "number" && isFinite(data5)) {
                          if (data5 > 1e3 || isNaN(data5)) {
                            validate181.errors = [{ instancePath: instancePath + "/y/min", schemaPath: "#/definitions/translateValue/properties/min/maximum", keyword: "maximum", params: { comparison: "<=", limit: 1e3 }, message: "must be <= 1000" }];
                            return false;
                          } else {
                            if (data5 < -1e3 || isNaN(data5)) {
                              validate181.errors = [{ instancePath: instancePath + "/y/min", schemaPath: "#/definitions/translateValue/properties/min/minimum", keyword: "minimum", params: { comparison: ">=", limit: -1e3 }, message: "must be >= -1000" }];
                              return false;
                            }
                          }
                        } else {
                          validate181.errors = [{ instancePath: instancePath + "/y/min", schemaPath: "#/definitions/translateValue/properties/min/type", keyword: "type", params: { type: "number" }, message: "must be number" }];
                          return false;
                        }
                      }
                      var valid4 = _errs16 === errors;
                    } else {
                      var valid4 = true;
                    }
                    if (valid4) {
                      if (data4.max !== void 0) {
                        let data6 = data4.max;
                        const _errs18 = errors;
                        if (errors === _errs18) {
                          if (typeof data6 == "number" && isFinite(data6)) {
                            if (data6 > 1e3 || isNaN(data6)) {
                              validate181.errors = [{ instancePath: instancePath + "/y/max", schemaPath: "#/definitions/translateValue/properties/max/maximum", keyword: "maximum", params: { comparison: "<=", limit: 1e3 }, message: "must be <= 1000" }];
                              return false;
                            } else {
                              if (data6 < -1e3 || isNaN(data6)) {
                                validate181.errors = [{ instancePath: instancePath + "/y/max", schemaPath: "#/definitions/translateValue/properties/max/minimum", keyword: "minimum", params: { comparison: ">=", limit: -1e3 }, message: "must be >= -1000" }];
                                return false;
                              }
                            }
                          } else {
                            validate181.errors = [{ instancePath: instancePath + "/y/max", schemaPath: "#/definitions/translateValue/properties/max/type", keyword: "type", params: { type: "number" }, message: "must be number" }];
                            return false;
                          }
                        }
                        var valid4 = _errs18 === errors;
                      } else {
                        var valid4 = true;
                      }
                      if (valid4) {
                        if (data4.step !== void 0) {
                          let data7 = data4.step;
                          const _errs20 = errors;
                          if (errors === _errs20) {
                            if (typeof data7 == "number" && isFinite(data7)) {
                              if (data7 > 2e3 || isNaN(data7)) {
                                validate181.errors = [{ instancePath: instancePath + "/y/step", schemaPath: "#/definitions/translateValue/properties/step/maximum", keyword: "maximum", params: { comparison: "<=", limit: 2e3 }, message: "must be <= 2000" }];
                                return false;
                              } else {
                                if (data7 <= 0 || isNaN(data7)) {
                                  validate181.errors = [{ instancePath: instancePath + "/y/step", schemaPath: "#/definitions/translateValue/properties/step/exclusiveMinimum", keyword: "exclusiveMinimum", params: { comparison: ">", limit: 0 }, message: "must be > 0" }];
                                  return false;
                                }
                              }
                            } else {
                              validate181.errors = [{ instancePath: instancePath + "/y/step", schemaPath: "#/definitions/translateValue/properties/step/type", keyword: "type", params: { type: "number" }, message: "must be number" }];
                              return false;
                            }
                          }
                          var valid4 = _errs20 === errors;
                        } else {
                          var valid4 = true;
                        }
                      }
                    }
                  }
                }
              } else {
                validate181.errors = [{ instancePath: instancePath + "/y", schemaPath: "#/definitions/translateValue/type", keyword: "type", params: { type: "object" }, message: "must be object" }];
                return false;
              }
            }
            var valid0 = _errs12 === errors;
          } else {
            var valid0 = true;
          }
        }
      }
    } else {
      validate181.errors = [{ instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" }];
      return false;
    }
  }
  validate181.errors = vErrors;
  return errors === 0;
}
var pattern34 = new RegExp("^[a-z][a-zA-Z0-9]*(:[a-z][a-zA-Z0-9]*)?$", "u");
function validate180(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  if (errors === 0) {
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing0;
      if (data.width === void 0 && (missing0 = "width") || data.height === void 0 && (missing0 = "height") || data.variants === void 0 && (missing0 = "variants")) {
        validate180.errors = [{ instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: missing0 }, message: "must have required property '" + missing0 + "'" }];
        return false;
      } else {
        const _errs1 = errors;
        for (const key0 in data) {
          if (!(key0 === "width" || key0 === "height" || key0 === "probability" || key0 === "rotate" || key0 === "scale" || key0 === "translate" || key0 === "variants")) {
            validate180.errors = [{ instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" }];
            return false;
            break;
          }
        }
        if (_errs1 === errors) {
          if (data.width !== void 0) {
            let data0 = data.width;
            const _errs2 = errors;
            if (errors === _errs2) {
              if (typeof data0 == "number" && isFinite(data0)) {
                if (data0 > 1e6 || isNaN(data0)) {
                  validate180.errors = [{ instancePath: instancePath + "/width", schemaPath: "#/properties/width/maximum", keyword: "maximum", params: { comparison: "<=", limit: 1e6 }, message: "must be <= 1000000" }];
                  return false;
                } else {
                  if (data0 < 1 || isNaN(data0)) {
                    validate180.errors = [{ instancePath: instancePath + "/width", schemaPath: "#/properties/width/minimum", keyword: "minimum", params: { comparison: ">=", limit: 1 }, message: "must be >= 1" }];
                    return false;
                  }
                }
              } else {
                validate180.errors = [{ instancePath: instancePath + "/width", schemaPath: "#/properties/width/type", keyword: "type", params: { type: "number" }, message: "must be number" }];
                return false;
              }
            }
            var valid0 = _errs2 === errors;
          } else {
            var valid0 = true;
          }
          if (valid0) {
            if (data.height !== void 0) {
              let data1 = data.height;
              const _errs4 = errors;
              if (errors === _errs4) {
                if (typeof data1 == "number" && isFinite(data1)) {
                  if (data1 > 1e6 || isNaN(data1)) {
                    validate180.errors = [{ instancePath: instancePath + "/height", schemaPath: "#/properties/height/maximum", keyword: "maximum", params: { comparison: "<=", limit: 1e6 }, message: "must be <= 1000000" }];
                    return false;
                  } else {
                    if (data1 < 1 || isNaN(data1)) {
                      validate180.errors = [{ instancePath: instancePath + "/height", schemaPath: "#/properties/height/minimum", keyword: "minimum", params: { comparison: ">=", limit: 1 }, message: "must be >= 1" }];
                      return false;
                    }
                  }
                } else {
                  validate180.errors = [{ instancePath: instancePath + "/height", schemaPath: "#/properties/height/type", keyword: "type", params: { type: "number" }, message: "must be number" }];
                  return false;
                }
              }
              var valid0 = _errs4 === errors;
            } else {
              var valid0 = true;
            }
            if (valid0) {
              if (data.probability !== void 0) {
                let data2 = data.probability;
                const _errs6 = errors;
                const _errs7 = errors;
                if (errors === _errs7) {
                  if (typeof data2 == "number" && isFinite(data2)) {
                    if (data2 > 100 || isNaN(data2)) {
                      validate180.errors = [{ instancePath: instancePath + "/probability", schemaPath: "#/definitions/componentProbability/maximum", keyword: "maximum", params: { comparison: "<=", limit: 100 }, message: "must be <= 100" }];
                      return false;
                    } else {
                      if (data2 < 0 || isNaN(data2)) {
                        validate180.errors = [{ instancePath: instancePath + "/probability", schemaPath: "#/definitions/componentProbability/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" }];
                        return false;
                      }
                    }
                  } else {
                    validate180.errors = [{ instancePath: instancePath + "/probability", schemaPath: "#/definitions/componentProbability/type", keyword: "type", params: { type: "number" }, message: "must be number" }];
                    return false;
                  }
                }
                var valid0 = _errs6 === errors;
              } else {
                var valid0 = true;
              }
              if (valid0) {
                if (data.rotate !== void 0) {
                  let data3 = data.rotate;
                  const _errs9 = errors;
                  const _errs10 = errors;
                  if (errors === _errs10) {
                    if (data3 && typeof data3 == "object" && !Array.isArray(data3)) {
                      let missing1;
                      if (data3.min === void 0 && (missing1 = "min") || data3.max === void 0 && (missing1 = "max")) {
                        validate180.errors = [{ instancePath: instancePath + "/rotate", schemaPath: "#/definitions/componentRotate/required", keyword: "required", params: { missingProperty: missing1 }, message: "must have required property '" + missing1 + "'" }];
                        return false;
                      } else {
                        const _errs12 = errors;
                        for (const key1 in data3) {
                          if (!(key1 === "min" || key1 === "max" || key1 === "step")) {
                            validate180.errors = [{ instancePath: instancePath + "/rotate", schemaPath: "#/definitions/componentRotate/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" }];
                            return false;
                            break;
                          }
                        }
                        if (_errs12 === errors) {
                          if (data3.min !== void 0) {
                            let data4 = data3.min;
                            const _errs13 = errors;
                            if (errors === _errs13) {
                              if (typeof data4 == "number" && isFinite(data4)) {
                                if (data4 > 360 || isNaN(data4)) {
                                  validate180.errors = [{ instancePath: instancePath + "/rotate/min", schemaPath: "#/definitions/componentRotate/properties/min/maximum", keyword: "maximum", params: { comparison: "<=", limit: 360 }, message: "must be <= 360" }];
                                  return false;
                                } else {
                                  if (data4 < -360 || isNaN(data4)) {
                                    validate180.errors = [{ instancePath: instancePath + "/rotate/min", schemaPath: "#/definitions/componentRotate/properties/min/minimum", keyword: "minimum", params: { comparison: ">=", limit: -360 }, message: "must be >= -360" }];
                                    return false;
                                  }
                                }
                              } else {
                                validate180.errors = [{ instancePath: instancePath + "/rotate/min", schemaPath: "#/definitions/componentRotate/properties/min/type", keyword: "type", params: { type: "number" }, message: "must be number" }];
                                return false;
                              }
                            }
                            var valid3 = _errs13 === errors;
                          } else {
                            var valid3 = true;
                          }
                          if (valid3) {
                            if (data3.max !== void 0) {
                              let data5 = data3.max;
                              const _errs15 = errors;
                              if (errors === _errs15) {
                                if (typeof data5 == "number" && isFinite(data5)) {
                                  if (data5 > 360 || isNaN(data5)) {
                                    validate180.errors = [{ instancePath: instancePath + "/rotate/max", schemaPath: "#/definitions/componentRotate/properties/max/maximum", keyword: "maximum", params: { comparison: "<=", limit: 360 }, message: "must be <= 360" }];
                                    return false;
                                  } else {
                                    if (data5 < -360 || isNaN(data5)) {
                                      validate180.errors = [{ instancePath: instancePath + "/rotate/max", schemaPath: "#/definitions/componentRotate/properties/max/minimum", keyword: "minimum", params: { comparison: ">=", limit: -360 }, message: "must be >= -360" }];
                                      return false;
                                    }
                                  }
                                } else {
                                  validate180.errors = [{ instancePath: instancePath + "/rotate/max", schemaPath: "#/definitions/componentRotate/properties/max/type", keyword: "type", params: { type: "number" }, message: "must be number" }];
                                  return false;
                                }
                              }
                              var valid3 = _errs15 === errors;
                            } else {
                              var valid3 = true;
                            }
                            if (valid3) {
                              if (data3.step !== void 0) {
                                let data6 = data3.step;
                                const _errs17 = errors;
                                if (errors === _errs17) {
                                  if (typeof data6 == "number" && isFinite(data6)) {
                                    if (data6 > 720 || isNaN(data6)) {
                                      validate180.errors = [{ instancePath: instancePath + "/rotate/step", schemaPath: "#/definitions/componentRotate/properties/step/maximum", keyword: "maximum", params: { comparison: "<=", limit: 720 }, message: "must be <= 720" }];
                                      return false;
                                    } else {
                                      if (data6 <= 0 || isNaN(data6)) {
                                        validate180.errors = [{ instancePath: instancePath + "/rotate/step", schemaPath: "#/definitions/componentRotate/properties/step/exclusiveMinimum", keyword: "exclusiveMinimum", params: { comparison: ">", limit: 0 }, message: "must be > 0" }];
                                        return false;
                                      }
                                    }
                                  } else {
                                    validate180.errors = [{ instancePath: instancePath + "/rotate/step", schemaPath: "#/definitions/componentRotate/properties/step/type", keyword: "type", params: { type: "number" }, message: "must be number" }];
                                    return false;
                                  }
                                }
                                var valid3 = _errs17 === errors;
                              } else {
                                var valid3 = true;
                              }
                            }
                          }
                        }
                      }
                    } else {
                      validate180.errors = [{ instancePath: instancePath + "/rotate", schemaPath: "#/definitions/componentRotate/type", keyword: "type", params: { type: "object" }, message: "must be object" }];
                      return false;
                    }
                  }
                  var valid0 = _errs9 === errors;
                } else {
                  var valid0 = true;
                }
                if (valid0) {
                  if (data.scale !== void 0) {
                    let data7 = data.scale;
                    const _errs19 = errors;
                    const _errs20 = errors;
                    if (errors === _errs20) {
                      if (data7 && typeof data7 == "object" && !Array.isArray(data7)) {
                        let missing2;
                        if (data7.min === void 0 && (missing2 = "min") || data7.max === void 0 && (missing2 = "max")) {
                          validate180.errors = [{ instancePath: instancePath + "/scale", schemaPath: "#/definitions/componentScale/required", keyword: "required", params: { missingProperty: missing2 }, message: "must have required property '" + missing2 + "'" }];
                          return false;
                        } else {
                          const _errs22 = errors;
                          for (const key2 in data7) {
                            if (!(key2 === "min" || key2 === "max" || key2 === "step")) {
                              validate180.errors = [{ instancePath: instancePath + "/scale", schemaPath: "#/definitions/componentScale/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key2 }, message: "must NOT have additional properties" }];
                              return false;
                              break;
                            }
                          }
                          if (_errs22 === errors) {
                            if (data7.min !== void 0) {
                              let data8 = data7.min;
                              const _errs23 = errors;
                              if (errors === _errs23) {
                                if (typeof data8 == "number" && isFinite(data8)) {
                                  if (data8 > 10 || isNaN(data8)) {
                                    validate180.errors = [{ instancePath: instancePath + "/scale/min", schemaPath: "#/definitions/componentScale/properties/min/maximum", keyword: "maximum", params: { comparison: "<=", limit: 10 }, message: "must be <= 10" }];
                                    return false;
                                  } else {
                                    if (data8 < 0 || isNaN(data8)) {
                                      validate180.errors = [{ instancePath: instancePath + "/scale/min", schemaPath: "#/definitions/componentScale/properties/min/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" }];
                                      return false;
                                    }
                                  }
                                } else {
                                  validate180.errors = [{ instancePath: instancePath + "/scale/min", schemaPath: "#/definitions/componentScale/properties/min/type", keyword: "type", params: { type: "number" }, message: "must be number" }];
                                  return false;
                                }
                              }
                              var valid5 = _errs23 === errors;
                            } else {
                              var valid5 = true;
                            }
                            if (valid5) {
                              if (data7.max !== void 0) {
                                let data9 = data7.max;
                                const _errs25 = errors;
                                if (errors === _errs25) {
                                  if (typeof data9 == "number" && isFinite(data9)) {
                                    if (data9 > 10 || isNaN(data9)) {
                                      validate180.errors = [{ instancePath: instancePath + "/scale/max", schemaPath: "#/definitions/componentScale/properties/max/maximum", keyword: "maximum", params: { comparison: "<=", limit: 10 }, message: "must be <= 10" }];
                                      return false;
                                    } else {
                                      if (data9 < 0 || isNaN(data9)) {
                                        validate180.errors = [{ instancePath: instancePath + "/scale/max", schemaPath: "#/definitions/componentScale/properties/max/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" }];
                                        return false;
                                      }
                                    }
                                  } else {
                                    validate180.errors = [{ instancePath: instancePath + "/scale/max", schemaPath: "#/definitions/componentScale/properties/max/type", keyword: "type", params: { type: "number" }, message: "must be number" }];
                                    return false;
                                  }
                                }
                                var valid5 = _errs25 === errors;
                              } else {
                                var valid5 = true;
                              }
                              if (valid5) {
                                if (data7.step !== void 0) {
                                  let data10 = data7.step;
                                  const _errs27 = errors;
                                  if (errors === _errs27) {
                                    if (typeof data10 == "number" && isFinite(data10)) {
                                      if (data10 > 10 || isNaN(data10)) {
                                        validate180.errors = [{ instancePath: instancePath + "/scale/step", schemaPath: "#/definitions/componentScale/properties/step/maximum", keyword: "maximum", params: { comparison: "<=", limit: 10 }, message: "must be <= 10" }];
                                        return false;
                                      } else {
                                        if (data10 <= 0 || isNaN(data10)) {
                                          validate180.errors = [{ instancePath: instancePath + "/scale/step", schemaPath: "#/definitions/componentScale/properties/step/exclusiveMinimum", keyword: "exclusiveMinimum", params: { comparison: ">", limit: 0 }, message: "must be > 0" }];
                                          return false;
                                        }
                                      }
                                    } else {
                                      validate180.errors = [{ instancePath: instancePath + "/scale/step", schemaPath: "#/definitions/componentScale/properties/step/type", keyword: "type", params: { type: "number" }, message: "must be number" }];
                                      return false;
                                    }
                                  }
                                  var valid5 = _errs27 === errors;
                                } else {
                                  var valid5 = true;
                                }
                              }
                            }
                          }
                        }
                      } else {
                        validate180.errors = [{ instancePath: instancePath + "/scale", schemaPath: "#/definitions/componentScale/type", keyword: "type", params: { type: "object" }, message: "must be object" }];
                        return false;
                      }
                    }
                    var valid0 = _errs19 === errors;
                  } else {
                    var valid0 = true;
                  }
                  if (valid0) {
                    if (data.translate !== void 0) {
                      const _errs29 = errors;
                      if (!validate181(data.translate, { instancePath: instancePath + "/translate", parentData: data, parentDataProperty: "translate", rootData })) {
                        vErrors = vErrors === null ? validate181.errors : vErrors.concat(validate181.errors);
                        errors = vErrors.length;
                      }
                      var valid0 = _errs29 === errors;
                    } else {
                      var valid0 = true;
                    }
                    if (valid0) {
                      if (data.variants !== void 0) {
                        let data12 = data.variants;
                        const _errs30 = errors;
                        if (errors === _errs30) {
                          if (data12 && typeof data12 == "object" && !Array.isArray(data12)) {
                            if (Object.keys(data12).length > 512) {
                              validate180.errors = [{ instancePath: instancePath + "/variants", schemaPath: "#/properties/variants/maxProperties", keyword: "maxProperties", params: { limit: 512 }, message: "must NOT have more than 512 properties" }];
                              return false;
                            } else {
                              for (const key3 in data12) {
                                const _errs32 = errors;
                                const _errs33 = errors;
                                if (errors === _errs33) {
                                  if (typeof key3 === "string") {
                                    if (func2(key3) > 64) {
                                      const err0 = { instancePath: instancePath + "/variants", schemaPath: "#/definitions/camelCaseName/maxLength", keyword: "maxLength", params: { limit: 64 }, message: "must NOT have more than 64 characters", propertyName: key3 };
                                      if (vErrors === null) {
                                        vErrors = [err0];
                                      } else {
                                        vErrors.push(err0);
                                      }
                                      errors++;
                                    } else {
                                      if (!pattern10.test(key3)) {
                                        const err1 = { instancePath: instancePath + "/variants", schemaPath: "#/definitions/camelCaseName/pattern", keyword: "pattern", params: { pattern: "^[a-z][a-zA-Z0-9]*$" }, message: 'must match pattern "^[a-z][a-zA-Z0-9]*$"', propertyName: key3 };
                                        if (vErrors === null) {
                                          vErrors = [err1];
                                        } else {
                                          vErrors.push(err1);
                                        }
                                        errors++;
                                      }
                                    }
                                  } else {
                                    const err2 = { instancePath: instancePath + "/variants", schemaPath: "#/definitions/camelCaseName/type", keyword: "type", params: { type: "string" }, message: "must be string", propertyName: key3 };
                                    if (vErrors === null) {
                                      vErrors = [err2];
                                    } else {
                                      vErrors.push(err2);
                                    }
                                    errors++;
                                  }
                                }
                                var valid6 = _errs32 === errors;
                                if (!valid6) {
                                  const err3 = { instancePath: instancePath + "/variants", schemaPath: "#/properties/variants/propertyNames", keyword: "propertyNames", params: { propertyName: key3 }, message: "property name must be valid" };
                                  if (vErrors === null) {
                                    vErrors = [err3];
                                  } else {
                                    vErrors.push(err3);
                                  }
                                  errors++;
                                  validate180.errors = vErrors;
                                  return false;
                                  break;
                                }
                              }
                              if (valid6) {
                                for (const key4 in data12) {
                                  let data13 = data12[key4];
                                  const _errs36 = errors;
                                  if (errors === _errs36) {
                                    if (data13 && typeof data13 == "object" && !Array.isArray(data13)) {
                                      let missing3;
                                      if (data13.elements === void 0 && (missing3 = "elements")) {
                                        validate180.errors = [{ instancePath: instancePath + "/variants/" + key4.replace(/~/g, "~0").replace(/\//g, "~1"), schemaPath: "#/properties/variants/additionalProperties/required", keyword: "required", params: { missingProperty: missing3 }, message: "must have required property '" + missing3 + "'" }];
                                        return false;
                                      } else {
                                        const _errs38 = errors;
                                        for (const key5 in data13) {
                                          if (!(key5 === "elements" || key5 === "weight" || key5 === "tags")) {
                                            validate180.errors = [{ instancePath: instancePath + "/variants/" + key4.replace(/~/g, "~0").replace(/\//g, "~1"), schemaPath: "#/properties/variants/additionalProperties/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key5 }, message: "must NOT have additional properties" }];
                                            return false;
                                            break;
                                          }
                                        }
                                        if (_errs38 === errors) {
                                          if (data13.elements !== void 0) {
                                            let data14 = data13.elements;
                                            const _errs39 = errors;
                                            if (errors === _errs39) {
                                              if (Array.isArray(data14)) {
                                                if (data14.length > 1024) {
                                                  validate180.errors = [{ instancePath: instancePath + "/variants/" + key4.replace(/~/g, "~0").replace(/\//g, "~1") + "/elements", schemaPath: "#/properties/variants/additionalProperties/properties/elements/maxItems", keyword: "maxItems", params: { limit: 1024 }, message: "must NOT have more than 1024 items" }];
                                                  return false;
                                                } else {
                                                  var valid10 = true;
                                                  const len0 = data14.length;
                                                  for (let i0 = 0; i0 < len0; i0++) {
                                                    const _errs41 = errors;
                                                    if (!validate166(data14[i0], { instancePath: instancePath + "/variants/" + key4.replace(/~/g, "~0").replace(/\//g, "~1") + "/elements/" + i0, parentData: data14, parentDataProperty: i0, rootData })) {
                                                      vErrors = vErrors === null ? validate166.errors : vErrors.concat(validate166.errors);
                                                      errors = vErrors.length;
                                                    }
                                                    var valid10 = _errs41 === errors;
                                                    if (!valid10) {
                                                      break;
                                                    }
                                                  }
                                                }
                                              } else {
                                                validate180.errors = [{ instancePath: instancePath + "/variants/" + key4.replace(/~/g, "~0").replace(/\//g, "~1") + "/elements", schemaPath: "#/properties/variants/additionalProperties/properties/elements/type", keyword: "type", params: { type: "array" }, message: "must be array" }];
                                                return false;
                                              }
                                            }
                                            var valid9 = _errs39 === errors;
                                          } else {
                                            var valid9 = true;
                                          }
                                          if (valid9) {
                                            if (data13.weight !== void 0) {
                                              let data16 = data13.weight;
                                              const _errs42 = errors;
                                              if (errors === _errs42) {
                                                if (typeof data16 == "number" && isFinite(data16)) {
                                                  if (data16 > 1e6 || isNaN(data16)) {
                                                    validate180.errors = [{ instancePath: instancePath + "/variants/" + key4.replace(/~/g, "~0").replace(/\//g, "~1") + "/weight", schemaPath: "#/properties/variants/additionalProperties/properties/weight/maximum", keyword: "maximum", params: { comparison: "<=", limit: 1e6 }, message: "must be <= 1000000" }];
                                                    return false;
                                                  } else {
                                                    if (data16 < 0 || isNaN(data16)) {
                                                      validate180.errors = [{ instancePath: instancePath + "/variants/" + key4.replace(/~/g, "~0").replace(/\//g, "~1") + "/weight", schemaPath: "#/properties/variants/additionalProperties/properties/weight/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" }];
                                                      return false;
                                                    }
                                                  }
                                                } else {
                                                  validate180.errors = [{ instancePath: instancePath + "/variants/" + key4.replace(/~/g, "~0").replace(/\//g, "~1") + "/weight", schemaPath: "#/properties/variants/additionalProperties/properties/weight/type", keyword: "type", params: { type: "number" }, message: "must be number" }];
                                                  return false;
                                                }
                                              }
                                              var valid9 = _errs42 === errors;
                                            } else {
                                              var valid9 = true;
                                            }
                                            if (valid9) {
                                              if (data13.tags !== void 0) {
                                                let data17 = data13.tags;
                                                const _errs44 = errors;
                                                if (errors === _errs44) {
                                                  if (Array.isArray(data17)) {
                                                    if (data17.length > 32) {
                                                      validate180.errors = [{ instancePath: instancePath + "/variants/" + key4.replace(/~/g, "~0").replace(/\//g, "~1") + "/tags", schemaPath: "#/properties/variants/additionalProperties/properties/tags/maxItems", keyword: "maxItems", params: { limit: 32 }, message: "must NOT have more than 32 items" }];
                                                      return false;
                                                    } else {
                                                      var valid11 = true;
                                                      const len1 = data17.length;
                                                      for (let i1 = 0; i1 < len1; i1++) {
                                                        let data18 = data17[i1];
                                                        const _errs46 = errors;
                                                        if (errors === _errs46) {
                                                          if (typeof data18 === "string") {
                                                            if (func2(data18) > 129) {
                                                              validate180.errors = [{ instancePath: instancePath + "/variants/" + key4.replace(/~/g, "~0").replace(/\//g, "~1") + "/tags/" + i1, schemaPath: "#/properties/variants/additionalProperties/properties/tags/items/maxLength", keyword: "maxLength", params: { limit: 129 }, message: "must NOT have more than 129 characters" }];
                                                              return false;
                                                            } else {
                                                              if (!pattern34.test(data18)) {
                                                                validate180.errors = [{ instancePath: instancePath + "/variants/" + key4.replace(/~/g, "~0").replace(/\//g, "~1") + "/tags/" + i1, schemaPath: "#/properties/variants/additionalProperties/properties/tags/items/pattern", keyword: "pattern", params: { pattern: "^[a-z][a-zA-Z0-9]*(:[a-z][a-zA-Z0-9]*)?$" }, message: 'must match pattern "^[a-z][a-zA-Z0-9]*(:[a-z][a-zA-Z0-9]*)?$"' }];
                                                                return false;
                                                              }
                                                            }
                                                          } else {
                                                            validate180.errors = [{ instancePath: instancePath + "/variants/" + key4.replace(/~/g, "~0").replace(/\//g, "~1") + "/tags/" + i1, schemaPath: "#/properties/variants/additionalProperties/properties/tags/items/type", keyword: "type", params: { type: "string" }, message: "must be string" }];
                                                            return false;
                                                          }
                                                        }
                                                        var valid11 = _errs46 === errors;
                                                        if (!valid11) {
                                                          break;
                                                        }
                                                      }
                                                      if (valid11) {
                                                        let i2 = data17.length;
                                                        let j0;
                                                        if (i2 > 1) {
                                                          const indices0 = {};
                                                          for (; i2--; ) {
                                                            let item0 = data17[i2];
                                                            if (typeof item0 !== "string") {
                                                              continue;
                                                            }
                                                            if (typeof indices0[item0] == "number") {
                                                              j0 = indices0[item0];
                                                              validate180.errors = [{ instancePath: instancePath + "/variants/" + key4.replace(/~/g, "~0").replace(/\//g, "~1") + "/tags", schemaPath: "#/properties/variants/additionalProperties/properties/tags/uniqueItems", keyword: "uniqueItems", params: { i: i2, j: j0 }, message: "must NOT have duplicate items (items ## " + j0 + " and " + i2 + " are identical)" }];
                                                              return false;
                                                              break;
                                                            }
                                                            indices0[item0] = i2;
                                                          }
                                                        }
                                                      }
                                                    }
                                                  } else {
                                                    validate180.errors = [{ instancePath: instancePath + "/variants/" + key4.replace(/~/g, "~0").replace(/\//g, "~1") + "/tags", schemaPath: "#/properties/variants/additionalProperties/properties/tags/type", keyword: "type", params: { type: "array" }, message: "must be array" }];
                                                    return false;
                                                  }
                                                }
                                                var valid9 = _errs44 === errors;
                                              } else {
                                                var valid9 = true;
                                              }
                                            }
                                          }
                                        }
                                      }
                                    } else {
                                      validate180.errors = [{ instancePath: instancePath + "/variants/" + key4.replace(/~/g, "~0").replace(/\//g, "~1"), schemaPath: "#/properties/variants/additionalProperties/type", keyword: "type", params: { type: "object" }, message: "must be object" }];
                                      return false;
                                    }
                                  }
                                  var valid8 = _errs36 === errors;
                                  if (!valid8) {
                                    break;
                                  }
                                }
                              }
                            }
                          } else {
                            validate180.errors = [{ instancePath: instancePath + "/variants", schemaPath: "#/properties/variants/type", keyword: "type", params: { type: "object" }, message: "must be object" }];
                            return false;
                          }
                        }
                        var valid0 = _errs30 === errors;
                      } else {
                        var valid0 = true;
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    } else {
      validate180.errors = [{ instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" }];
      return false;
    }
  }
  validate180.errors = vErrors;
  return errors === 0;
}
function validate185(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  if (errors === 0) {
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing0;
      if (data.extends === void 0 && (missing0 = "extends")) {
        validate185.errors = [{ instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: missing0 }, message: "must have required property '" + missing0 + "'" }];
        return false;
      } else {
        const _errs1 = errors;
        for (const key0 in data) {
          if (!(key0 === "extends")) {
            validate185.errors = [{ instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" }];
            return false;
            break;
          }
        }
        if (_errs1 === errors) {
          if (data.extends !== void 0) {
            if (!validate168(data.extends, { instancePath: instancePath + "/extends", parentData: data, parentDataProperty: "extends", rootData })) {
              vErrors = vErrors === null ? validate168.errors : vErrors.concat(validate168.errors);
              errors = vErrors.length;
            }
          }
        }
      }
    } else {
      validate185.errors = [{ instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" }];
      return false;
    }
  }
  validate185.errors = vErrors;
  return errors === 0;
}
function validate10(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  ;
  let vErrors = null;
  let errors = 0;
  if (errors === 0) {
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing0;
      if (data.canvas === void 0 && (missing0 = "canvas")) {
        validate10.errors = [{ instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: missing0 }, message: "must have required property '" + missing0 + "'" }];
        return false;
      } else {
        const _errs1 = errors;
        for (const key0 in data) {
          if (!(key0 === "$id" || key0 === "$schema" || key0 === "$comment" || key0 === "meta" || key0 === "attributes" || key0 === "canvas" || key0 === "components" || key0 === "colors")) {
            validate10.errors = [{ instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" }];
            return false;
            break;
          }
        }
        if (_errs1 === errors) {
          if (data.$id !== void 0) {
            let data0 = data.$id;
            const _errs2 = errors;
            if (errors === _errs2) {
              if (typeof data0 === "string") {
                if (func2(data0) > 256) {
                  validate10.errors = [{ instancePath: instancePath + "/$id", schemaPath: "#/properties/%24id/maxLength", keyword: "maxLength", params: { limit: 256 }, message: "must NOT have more than 256 characters" }];
                  return false;
                }
              } else {
                validate10.errors = [{ instancePath: instancePath + "/$id", schemaPath: "#/properties/%24id/type", keyword: "type", params: { type: "string" }, message: "must be string" }];
                return false;
              }
            }
            var valid0 = _errs2 === errors;
          } else {
            var valid0 = true;
          }
          if (valid0) {
            if (data.$schema !== void 0) {
              let data1 = data.$schema;
              const _errs4 = errors;
              if (errors === _errs4) {
                if (typeof data1 === "string") {
                  if (func2(data1) > 256) {
                    validate10.errors = [{ instancePath: instancePath + "/$schema", schemaPath: "#/properties/%24schema/maxLength", keyword: "maxLength", params: { limit: 256 }, message: "must NOT have more than 256 characters" }];
                    return false;
                  }
                } else {
                  validate10.errors = [{ instancePath: instancePath + "/$schema", schemaPath: "#/properties/%24schema/type", keyword: "type", params: { type: "string" }, message: "must be string" }];
                  return false;
                }
              }
              var valid0 = _errs4 === errors;
            } else {
              var valid0 = true;
            }
            if (valid0) {
              if (data.$comment !== void 0) {
                let data2 = data.$comment;
                const _errs6 = errors;
                if (errors === _errs6) {
                  if (typeof data2 === "string") {
                    if (func2(data2) > 4096) {
                      validate10.errors = [{ instancePath: instancePath + "/$comment", schemaPath: "#/properties/%24comment/maxLength", keyword: "maxLength", params: { limit: 4096 }, message: "must NOT have more than 4096 characters" }];
                      return false;
                    }
                  } else {
                    validate10.errors = [{ instancePath: instancePath + "/$comment", schemaPath: "#/properties/%24comment/type", keyword: "type", params: { type: "string" }, message: "must be string" }];
                    return false;
                  }
                }
                var valid0 = _errs6 === errors;
              } else {
                var valid0 = true;
              }
              if (valid0) {
                if (data.meta !== void 0) {
                  let data3 = data.meta;
                  const _errs8 = errors;
                  if (errors === _errs8) {
                    if (data3 && typeof data3 == "object" && !Array.isArray(data3)) {
                      const _errs10 = errors;
                      for (const key1 in data3) {
                        if (!(key1 === "license" || key1 === "creator" || key1 === "source")) {
                          validate10.errors = [{ instancePath: instancePath + "/meta", schemaPath: "#/properties/meta/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" }];
                          return false;
                          break;
                        }
                      }
                      if (_errs10 === errors) {
                        if (data3.license !== void 0) {
                          let data4 = data3.license;
                          const _errs11 = errors;
                          if (errors === _errs11) {
                            if (data4 && typeof data4 == "object" && !Array.isArray(data4)) {
                              const _errs13 = errors;
                              for (const key2 in data4) {
                                if (!(key2 === "name" || key2 === "url" || key2 === "text")) {
                                  validate10.errors = [{ instancePath: instancePath + "/meta/license", schemaPath: "#/properties/meta/properties/license/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key2 }, message: "must NOT have additional properties" }];
                                  return false;
                                  break;
                                }
                              }
                              if (_errs13 === errors) {
                                if (data4.name !== void 0) {
                                  let data5 = data4.name;
                                  const _errs14 = errors;
                                  if (errors === _errs14) {
                                    if (typeof data5 === "string") {
                                      if (func2(data5) > 128) {
                                        validate10.errors = [{ instancePath: instancePath + "/meta/license/name", schemaPath: "#/properties/meta/properties/license/properties/name/maxLength", keyword: "maxLength", params: { limit: 128 }, message: "must NOT have more than 128 characters" }];
                                        return false;
                                      }
                                    } else {
                                      validate10.errors = [{ instancePath: instancePath + "/meta/license/name", schemaPath: "#/properties/meta/properties/license/properties/name/type", keyword: "type", params: { type: "string" }, message: "must be string" }];
                                      return false;
                                    }
                                  }
                                  var valid2 = _errs14 === errors;
                                } else {
                                  var valid2 = true;
                                }
                                if (valid2) {
                                  if (data4.url !== void 0) {
                                    let data6 = data4.url;
                                    const _errs16 = errors;
                                    const _errs17 = errors;
                                    if (errors === _errs17) {
                                      if (typeof data6 === "string") {
                                        if (func2(data6) > 2048) {
                                          validate10.errors = [{ instancePath: instancePath + "/meta/license/url", schemaPath: "#/definitions/safeUrl/maxLength", keyword: "maxLength", params: { limit: 2048 }, message: "must NOT have more than 2048 characters" }];
                                          return false;
                                        } else {
                                          if (!pattern0.test(data6)) {
                                            validate10.errors = [{ instancePath: instancePath + "/meta/license/url", schemaPath: "#/definitions/safeUrl/pattern", keyword: "pattern", params: { pattern: "^https?://" }, message: 'must match pattern "^https?://"' }];
                                            return false;
                                          }
                                        }
                                      } else {
                                        validate10.errors = [{ instancePath: instancePath + "/meta/license/url", schemaPath: "#/definitions/safeUrl/type", keyword: "type", params: { type: "string" }, message: "must be string" }];
                                        return false;
                                      }
                                    }
                                    var valid2 = _errs16 === errors;
                                  } else {
                                    var valid2 = true;
                                  }
                                  if (valid2) {
                                    if (data4.text !== void 0) {
                                      let data7 = data4.text;
                                      const _errs19 = errors;
                                      if (errors === _errs19) {
                                        if (typeof data7 === "string") {
                                          if (func2(data7) > 32768) {
                                            validate10.errors = [{ instancePath: instancePath + "/meta/license/text", schemaPath: "#/properties/meta/properties/license/properties/text/maxLength", keyword: "maxLength", params: { limit: 32768 }, message: "must NOT have more than 32768 characters" }];
                                            return false;
                                          }
                                        } else {
                                          validate10.errors = [{ instancePath: instancePath + "/meta/license/text", schemaPath: "#/properties/meta/properties/license/properties/text/type", keyword: "type", params: { type: "string" }, message: "must be string" }];
                                          return false;
                                        }
                                      }
                                      var valid2 = _errs19 === errors;
                                    } else {
                                      var valid2 = true;
                                    }
                                  }
                                }
                              }
                            } else {
                              validate10.errors = [{ instancePath: instancePath + "/meta/license", schemaPath: "#/properties/meta/properties/license/type", keyword: "type", params: { type: "object" }, message: "must be object" }];
                              return false;
                            }
                          }
                          var valid1 = _errs11 === errors;
                        } else {
                          var valid1 = true;
                        }
                        if (valid1) {
                          if (data3.creator !== void 0) {
                            let data8 = data3.creator;
                            const _errs21 = errors;
                            if (errors === _errs21) {
                              if (data8 && typeof data8 == "object" && !Array.isArray(data8)) {
                                const _errs23 = errors;
                                for (const key3 in data8) {
                                  if (!(key3 === "name" || key3 === "url")) {
                                    validate10.errors = [{ instancePath: instancePath + "/meta/creator", schemaPath: "#/properties/meta/properties/creator/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key3 }, message: "must NOT have additional properties" }];
                                    return false;
                                    break;
                                  }
                                }
                                if (_errs23 === errors) {
                                  if (data8.name !== void 0) {
                                    let data9 = data8.name;
                                    const _errs24 = errors;
                                    if (errors === _errs24) {
                                      if (typeof data9 === "string") {
                                        if (func2(data9) > 128) {
                                          validate10.errors = [{ instancePath: instancePath + "/meta/creator/name", schemaPath: "#/properties/meta/properties/creator/properties/name/maxLength", keyword: "maxLength", params: { limit: 128 }, message: "must NOT have more than 128 characters" }];
                                          return false;
                                        }
                                      } else {
                                        validate10.errors = [{ instancePath: instancePath + "/meta/creator/name", schemaPath: "#/properties/meta/properties/creator/properties/name/type", keyword: "type", params: { type: "string" }, message: "must be string" }];
                                        return false;
                                      }
                                    }
                                    var valid4 = _errs24 === errors;
                                  } else {
                                    var valid4 = true;
                                  }
                                  if (valid4) {
                                    if (data8.url !== void 0) {
                                      let data10 = data8.url;
                                      const _errs26 = errors;
                                      const _errs27 = errors;
                                      if (errors === _errs27) {
                                        if (typeof data10 === "string") {
                                          if (func2(data10) > 2048) {
                                            validate10.errors = [{ instancePath: instancePath + "/meta/creator/url", schemaPath: "#/definitions/safeUrl/maxLength", keyword: "maxLength", params: { limit: 2048 }, message: "must NOT have more than 2048 characters" }];
                                            return false;
                                          } else {
                                            if (!pattern0.test(data10)) {
                                              validate10.errors = [{ instancePath: instancePath + "/meta/creator/url", schemaPath: "#/definitions/safeUrl/pattern", keyword: "pattern", params: { pattern: "^https?://" }, message: 'must match pattern "^https?://"' }];
                                              return false;
                                            }
                                          }
                                        } else {
                                          validate10.errors = [{ instancePath: instancePath + "/meta/creator/url", schemaPath: "#/definitions/safeUrl/type", keyword: "type", params: { type: "string" }, message: "must be string" }];
                                          return false;
                                        }
                                      }
                                      var valid4 = _errs26 === errors;
                                    } else {
                                      var valid4 = true;
                                    }
                                  }
                                }
                              } else {
                                validate10.errors = [{ instancePath: instancePath + "/meta/creator", schemaPath: "#/properties/meta/properties/creator/type", keyword: "type", params: { type: "object" }, message: "must be object" }];
                                return false;
                              }
                            }
                            var valid1 = _errs21 === errors;
                          } else {
                            var valid1 = true;
                          }
                          if (valid1) {
                            if (data3.source !== void 0) {
                              let data11 = data3.source;
                              const _errs29 = errors;
                              if (errors === _errs29) {
                                if (data11 && typeof data11 == "object" && !Array.isArray(data11)) {
                                  const _errs31 = errors;
                                  for (const key4 in data11) {
                                    if (!(key4 === "name" || key4 === "url")) {
                                      validate10.errors = [{ instancePath: instancePath + "/meta/source", schemaPath: "#/properties/meta/properties/source/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key4 }, message: "must NOT have additional properties" }];
                                      return false;
                                      break;
                                    }
                                  }
                                  if (_errs31 === errors) {
                                    if (data11.name !== void 0) {
                                      let data12 = data11.name;
                                      const _errs32 = errors;
                                      if (errors === _errs32) {
                                        if (typeof data12 === "string") {
                                          if (func2(data12) > 128) {
                                            validate10.errors = [{ instancePath: instancePath + "/meta/source/name", schemaPath: "#/properties/meta/properties/source/properties/name/maxLength", keyword: "maxLength", params: { limit: 128 }, message: "must NOT have more than 128 characters" }];
                                            return false;
                                          }
                                        } else {
                                          validate10.errors = [{ instancePath: instancePath + "/meta/source/name", schemaPath: "#/properties/meta/properties/source/properties/name/type", keyword: "type", params: { type: "string" }, message: "must be string" }];
                                          return false;
                                        }
                                      }
                                      var valid6 = _errs32 === errors;
                                    } else {
                                      var valid6 = true;
                                    }
                                    if (valid6) {
                                      if (data11.url !== void 0) {
                                        let data13 = data11.url;
                                        const _errs34 = errors;
                                        const _errs35 = errors;
                                        if (errors === _errs35) {
                                          if (typeof data13 === "string") {
                                            if (func2(data13) > 2048) {
                                              validate10.errors = [{ instancePath: instancePath + "/meta/source/url", schemaPath: "#/definitions/safeUrl/maxLength", keyword: "maxLength", params: { limit: 2048 }, message: "must NOT have more than 2048 characters" }];
                                              return false;
                                            } else {
                                              if (!pattern0.test(data13)) {
                                                validate10.errors = [{ instancePath: instancePath + "/meta/source/url", schemaPath: "#/definitions/safeUrl/pattern", keyword: "pattern", params: { pattern: "^https?://" }, message: 'must match pattern "^https?://"' }];
                                                return false;
                                              }
                                            }
                                          } else {
                                            validate10.errors = [{ instancePath: instancePath + "/meta/source/url", schemaPath: "#/definitions/safeUrl/type", keyword: "type", params: { type: "string" }, message: "must be string" }];
                                            return false;
                                          }
                                        }
                                        var valid6 = _errs34 === errors;
                                      } else {
                                        var valid6 = true;
                                      }
                                    }
                                  }
                                } else {
                                  validate10.errors = [{ instancePath: instancePath + "/meta/source", schemaPath: "#/properties/meta/properties/source/type", keyword: "type", params: { type: "object" }, message: "must be object" }];
                                  return false;
                                }
                              }
                              var valid1 = _errs29 === errors;
                            } else {
                              var valid1 = true;
                            }
                          }
                        }
                      }
                    } else {
                      validate10.errors = [{ instancePath: instancePath + "/meta", schemaPath: "#/properties/meta/type", keyword: "type", params: { type: "object" }, message: "must be object" }];
                      return false;
                    }
                  }
                  var valid0 = _errs8 === errors;
                } else {
                  var valid0 = true;
                }
                if (valid0) {
                  if (data.attributes !== void 0) {
                    const _errs37 = errors;
                    if (!validate11(data.attributes, { instancePath: instancePath + "/attributes", parentData: data, parentDataProperty: "attributes", rootData })) {
                      vErrors = vErrors === null ? validate11.errors : vErrors.concat(validate11.errors);
                      errors = vErrors.length;
                    }
                    var valid0 = _errs37 === errors;
                  } else {
                    var valid0 = true;
                  }
                  if (valid0) {
                    if (data.canvas !== void 0) {
                      let data15 = data.canvas;
                      const _errs38 = errors;
                      if (errors === _errs38) {
                        if (data15 && typeof data15 == "object" && !Array.isArray(data15)) {
                          let missing1;
                          if (data15.elements === void 0 && (missing1 = "elements") || data15.width === void 0 && (missing1 = "width") || data15.height === void 0 && (missing1 = "height")) {
                            validate10.errors = [{ instancePath: instancePath + "/canvas", schemaPath: "#/properties/canvas/required", keyword: "required", params: { missingProperty: missing1 }, message: "must have required property '" + missing1 + "'" }];
                            return false;
                          } else {
                            const _errs40 = errors;
                            for (const key5 in data15) {
                              if (!(key5 === "elements" || key5 === "width" || key5 === "height")) {
                                validate10.errors = [{ instancePath: instancePath + "/canvas", schemaPath: "#/properties/canvas/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key5 }, message: "must NOT have additional properties" }];
                                return false;
                                break;
                              }
                            }
                            if (_errs40 === errors) {
                              if (data15.elements !== void 0) {
                                let data16 = data15.elements;
                                const _errs41 = errors;
                                if (errors === _errs41) {
                                  if (Array.isArray(data16)) {
                                    if (data16.length > 1024) {
                                      validate10.errors = [{ instancePath: instancePath + "/canvas/elements", schemaPath: "#/properties/canvas/properties/elements/maxItems", keyword: "maxItems", params: { limit: 1024 }, message: "must NOT have more than 1024 items" }];
                                      return false;
                                    } else {
                                      var valid9 = true;
                                      const len0 = data16.length;
                                      for (let i0 = 0; i0 < len0; i0++) {
                                        const _errs43 = errors;
                                        if (!validate166(data16[i0], { instancePath: instancePath + "/canvas/elements/" + i0, parentData: data16, parentDataProperty: i0, rootData })) {
                                          vErrors = vErrors === null ? validate166.errors : vErrors.concat(validate166.errors);
                                          errors = vErrors.length;
                                        }
                                        var valid9 = _errs43 === errors;
                                        if (!valid9) {
                                          break;
                                        }
                                      }
                                    }
                                  } else {
                                    validate10.errors = [{ instancePath: instancePath + "/canvas/elements", schemaPath: "#/properties/canvas/properties/elements/type", keyword: "type", params: { type: "array" }, message: "must be array" }];
                                    return false;
                                  }
                                }
                                var valid8 = _errs41 === errors;
                              } else {
                                var valid8 = true;
                              }
                              if (valid8) {
                                if (data15.width !== void 0) {
                                  let data18 = data15.width;
                                  const _errs44 = errors;
                                  if (errors === _errs44) {
                                    if (typeof data18 == "number" && isFinite(data18)) {
                                      if (data18 > 1e6 || isNaN(data18)) {
                                        validate10.errors = [{ instancePath: instancePath + "/canvas/width", schemaPath: "#/properties/canvas/properties/width/maximum", keyword: "maximum", params: { comparison: "<=", limit: 1e6 }, message: "must be <= 1000000" }];
                                        return false;
                                      } else {
                                        if (data18 < 1 || isNaN(data18)) {
                                          validate10.errors = [{ instancePath: instancePath + "/canvas/width", schemaPath: "#/properties/canvas/properties/width/minimum", keyword: "minimum", params: { comparison: ">=", limit: 1 }, message: "must be >= 1" }];
                                          return false;
                                        }
                                      }
                                    } else {
                                      validate10.errors = [{ instancePath: instancePath + "/canvas/width", schemaPath: "#/properties/canvas/properties/width/type", keyword: "type", params: { type: "number" }, message: "must be number" }];
                                      return false;
                                    }
                                  }
                                  var valid8 = _errs44 === errors;
                                } else {
                                  var valid8 = true;
                                }
                                if (valid8) {
                                  if (data15.height !== void 0) {
                                    let data19 = data15.height;
                                    const _errs46 = errors;
                                    if (errors === _errs46) {
                                      if (typeof data19 == "number" && isFinite(data19)) {
                                        if (data19 > 1e6 || isNaN(data19)) {
                                          validate10.errors = [{ instancePath: instancePath + "/canvas/height", schemaPath: "#/properties/canvas/properties/height/maximum", keyword: "maximum", params: { comparison: "<=", limit: 1e6 }, message: "must be <= 1000000" }];
                                          return false;
                                        } else {
                                          if (data19 < 1 || isNaN(data19)) {
                                            validate10.errors = [{ instancePath: instancePath + "/canvas/height", schemaPath: "#/properties/canvas/properties/height/minimum", keyword: "minimum", params: { comparison: ">=", limit: 1 }, message: "must be >= 1" }];
                                            return false;
                                          }
                                        }
                                      } else {
                                        validate10.errors = [{ instancePath: instancePath + "/canvas/height", schemaPath: "#/properties/canvas/properties/height/type", keyword: "type", params: { type: "number" }, message: "must be number" }];
                                        return false;
                                      }
                                    }
                                    var valid8 = _errs46 === errors;
                                  } else {
                                    var valid8 = true;
                                  }
                                }
                              }
                            }
                          }
                        } else {
                          validate10.errors = [{ instancePath: instancePath + "/canvas", schemaPath: "#/properties/canvas/type", keyword: "type", params: { type: "object" }, message: "must be object" }];
                          return false;
                        }
                      }
                      var valid0 = _errs38 === errors;
                    } else {
                      var valid0 = true;
                    }
                    if (valid0) {
                      if (data.components !== void 0) {
                        let data20 = data.components;
                        const _errs48 = errors;
                        if (errors === _errs48) {
                          if (data20 && typeof data20 == "object" && !Array.isArray(data20)) {
                            if (Object.keys(data20).length > 512) {
                              validate10.errors = [{ instancePath: instancePath + "/components", schemaPath: "#/properties/components/maxProperties", keyword: "maxProperties", params: { limit: 512 }, message: "must NOT have more than 512 properties" }];
                              return false;
                            } else {
                              for (const key6 in data20) {
                                const _errs50 = errors;
                                const _errs51 = errors;
                                if (errors === _errs51) {
                                  if (typeof key6 === "string") {
                                    if (func2(key6) > 64) {
                                      const err0 = { instancePath: instancePath + "/components", schemaPath: "#/definitions/camelCaseName/maxLength", keyword: "maxLength", params: { limit: 64 }, message: "must NOT have more than 64 characters", propertyName: key6 };
                                      if (vErrors === null) {
                                        vErrors = [err0];
                                      } else {
                                        vErrors.push(err0);
                                      }
                                      errors++;
                                    } else {
                                      if (!pattern10.test(key6)) {
                                        const err1 = { instancePath: instancePath + "/components", schemaPath: "#/definitions/camelCaseName/pattern", keyword: "pattern", params: { pattern: "^[a-z][a-zA-Z0-9]*$" }, message: 'must match pattern "^[a-z][a-zA-Z0-9]*$"', propertyName: key6 };
                                        if (vErrors === null) {
                                          vErrors = [err1];
                                        } else {
                                          vErrors.push(err1);
                                        }
                                        errors++;
                                      }
                                    }
                                  } else {
                                    const err2 = { instancePath: instancePath + "/components", schemaPath: "#/definitions/camelCaseName/type", keyword: "type", params: { type: "string" }, message: "must be string", propertyName: key6 };
                                    if (vErrors === null) {
                                      vErrors = [err2];
                                    } else {
                                      vErrors.push(err2);
                                    }
                                    errors++;
                                  }
                                }
                                var valid10 = _errs50 === errors;
                                if (!valid10) {
                                  const err3 = { instancePath: instancePath + "/components", schemaPath: "#/properties/components/propertyNames", keyword: "propertyNames", params: { propertyName: key6 }, message: "property name must be valid" };
                                  if (vErrors === null) {
                                    vErrors = [err3];
                                  } else {
                                    vErrors.push(err3);
                                  }
                                  errors++;
                                  validate10.errors = vErrors;
                                  return false;
                                  break;
                                }
                              }
                              if (valid10) {
                                for (const key7 in data20) {
                                  let data21 = data20[key7];
                                  const _errs54 = errors;
                                  const _errs55 = errors;
                                  let valid13 = false;
                                  const _errs56 = errors;
                                  if (!validate180(data21, { instancePath: instancePath + "/components/" + key7.replace(/~/g, "~0").replace(/\//g, "~1"), parentData: data20, parentDataProperty: key7, rootData })) {
                                    vErrors = vErrors === null ? validate180.errors : vErrors.concat(validate180.errors);
                                    errors = vErrors.length;
                                  }
                                  var _valid0 = _errs56 === errors;
                                  valid13 = valid13 || _valid0;
                                  if (!valid13) {
                                    const _errs57 = errors;
                                    if (!validate185(data21, { instancePath: instancePath + "/components/" + key7.replace(/~/g, "~0").replace(/\//g, "~1"), parentData: data20, parentDataProperty: key7, rootData })) {
                                      vErrors = vErrors === null ? validate185.errors : vErrors.concat(validate185.errors);
                                      errors = vErrors.length;
                                    }
                                    var _valid0 = _errs57 === errors;
                                    valid13 = valid13 || _valid0;
                                  }
                                  if (!valid13) {
                                    const err4 = { instancePath: instancePath + "/components/" + key7.replace(/~/g, "~0").replace(/\//g, "~1"), schemaPath: "#/properties/components/additionalProperties/anyOf", keyword: "anyOf", params: {}, message: "must match a schema in anyOf" };
                                    if (vErrors === null) {
                                      vErrors = [err4];
                                    } else {
                                      vErrors.push(err4);
                                    }
                                    errors++;
                                    validate10.errors = vErrors;
                                    return false;
                                  } else {
                                    errors = _errs55;
                                    if (vErrors !== null) {
                                      if (_errs55) {
                                        vErrors.length = _errs55;
                                      } else {
                                        vErrors = null;
                                      }
                                    }
                                  }
                                  var valid12 = _errs54 === errors;
                                  if (!valid12) {
                                    break;
                                  }
                                }
                              }
                            }
                          } else {
                            validate10.errors = [{ instancePath: instancePath + "/components", schemaPath: "#/properties/components/type", keyword: "type", params: { type: "object" }, message: "must be object" }];
                            return false;
                          }
                        }
                        var valid0 = _errs48 === errors;
                      } else {
                        var valid0 = true;
                      }
                      if (valid0) {
                        if (data.colors !== void 0) {
                          let data22 = data.colors;
                          const _errs58 = errors;
                          if (errors === _errs58) {
                            if (data22 && typeof data22 == "object" && !Array.isArray(data22)) {
                              if (Object.keys(data22).length > 512) {
                                validate10.errors = [{ instancePath: instancePath + "/colors", schemaPath: "#/properties/colors/maxProperties", keyword: "maxProperties", params: { limit: 512 }, message: "must NOT have more than 512 properties" }];
                                return false;
                              } else {
                                for (const key8 in data22) {
                                  const _errs60 = errors;
                                  const _errs61 = errors;
                                  if (errors === _errs61) {
                                    if (typeof key8 === "string") {
                                      if (func2(key8) > 64) {
                                        const err5 = { instancePath: instancePath + "/colors", schemaPath: "#/definitions/camelCaseName/maxLength", keyword: "maxLength", params: { limit: 64 }, message: "must NOT have more than 64 characters", propertyName: key8 };
                                        if (vErrors === null) {
                                          vErrors = [err5];
                                        } else {
                                          vErrors.push(err5);
                                        }
                                        errors++;
                                      } else {
                                        if (!pattern10.test(key8)) {
                                          const err6 = { instancePath: instancePath + "/colors", schemaPath: "#/definitions/camelCaseName/pattern", keyword: "pattern", params: { pattern: "^[a-z][a-zA-Z0-9]*$" }, message: 'must match pattern "^[a-z][a-zA-Z0-9]*$"', propertyName: key8 };
                                          if (vErrors === null) {
                                            vErrors = [err6];
                                          } else {
                                            vErrors.push(err6);
                                          }
                                          errors++;
                                        }
                                      }
                                    } else {
                                      const err7 = { instancePath: instancePath + "/colors", schemaPath: "#/definitions/camelCaseName/type", keyword: "type", params: { type: "string" }, message: "must be string", propertyName: key8 };
                                      if (vErrors === null) {
                                        vErrors = [err7];
                                      } else {
                                        vErrors.push(err7);
                                      }
                                      errors++;
                                    }
                                  }
                                  var valid14 = _errs60 === errors;
                                  if (!valid14) {
                                    const err8 = { instancePath: instancePath + "/colors", schemaPath: "#/properties/colors/propertyNames", keyword: "propertyNames", params: { propertyName: key8 }, message: "property name must be valid" };
                                    if (vErrors === null) {
                                      vErrors = [err8];
                                    } else {
                                      vErrors.push(err8);
                                    }
                                    errors++;
                                    validate10.errors = vErrors;
                                    return false;
                                    break;
                                  }
                                }
                                if (valid14) {
                                  for (const key9 in data22) {
                                    let data23 = data22[key9];
                                    const _errs64 = errors;
                                    if (errors === _errs64) {
                                      if (data23 && typeof data23 == "object" && !Array.isArray(data23)) {
                                        let missing2;
                                        if (data23.values === void 0 && (missing2 = "values")) {
                                          validate10.errors = [{ instancePath: instancePath + "/colors/" + key9.replace(/~/g, "~0").replace(/\//g, "~1"), schemaPath: "#/properties/colors/additionalProperties/required", keyword: "required", params: { missingProperty: missing2 }, message: "must have required property '" + missing2 + "'" }];
                                          return false;
                                        } else {
                                          const _errs66 = errors;
                                          for (const key10 in data23) {
                                            if (!(key10 === "values" || key10 === "notEqualTo" || key10 === "contrastTo")) {
                                              validate10.errors = [{ instancePath: instancePath + "/colors/" + key9.replace(/~/g, "~0").replace(/\//g, "~1"), schemaPath: "#/properties/colors/additionalProperties/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key10 }, message: "must NOT have additional properties" }];
                                              return false;
                                              break;
                                            }
                                          }
                                          if (_errs66 === errors) {
                                            if (data23.values !== void 0) {
                                              let data24 = data23.values;
                                              const _errs67 = errors;
                                              if (errors === _errs67) {
                                                if (Array.isArray(data24)) {
                                                  if (data24.length > 128) {
                                                    validate10.errors = [{ instancePath: instancePath + "/colors/" + key9.replace(/~/g, "~0").replace(/\//g, "~1") + "/values", schemaPath: "#/properties/colors/additionalProperties/properties/values/maxItems", keyword: "maxItems", params: { limit: 128 }, message: "must NOT have more than 128 items" }];
                                                    return false;
                                                  } else {
                                                    if (data24.length < 1) {
                                                      validate10.errors = [{ instancePath: instancePath + "/colors/" + key9.replace(/~/g, "~0").replace(/\//g, "~1") + "/values", schemaPath: "#/properties/colors/additionalProperties/properties/values/minItems", keyword: "minItems", params: { limit: 1 }, message: "must NOT have fewer than 1 items" }];
                                                      return false;
                                                    } else {
                                                      var valid18 = true;
                                                      const len1 = data24.length;
                                                      for (let i1 = 0; i1 < len1; i1++) {
                                                        let data25 = data24[i1];
                                                        const _errs69 = errors;
                                                        const _errs70 = errors;
                                                        if (errors === _errs70) {
                                                          if (typeof data25 === "string") {
                                                            if (func2(data25) > 9) {
                                                              validate10.errors = [{ instancePath: instancePath + "/colors/" + key9.replace(/~/g, "~0").replace(/\//g, "~1") + "/values/" + i1, schemaPath: "#/definitions/hexColor/maxLength", keyword: "maxLength", params: { limit: 9 }, message: "must NOT have more than 9 characters" }];
                                                              return false;
                                                            } else {
                                                              if (!pattern36.test(data25)) {
                                                                validate10.errors = [{ instancePath: instancePath + "/colors/" + key9.replace(/~/g, "~0").replace(/\//g, "~1") + "/values/" + i1, schemaPath: "#/definitions/hexColor/pattern", keyword: "pattern", params: { pattern: "^#([a-fA-F0-9]{3}|[a-fA-F0-9]{4}|[a-fA-F0-9]{6}|[a-fA-F0-9]{8})$" }, message: 'must match pattern "^#([a-fA-F0-9]{3}|[a-fA-F0-9]{4}|[a-fA-F0-9]{6}|[a-fA-F0-9]{8})$"' }];
                                                                return false;
                                                              }
                                                            }
                                                          } else {
                                                            validate10.errors = [{ instancePath: instancePath + "/colors/" + key9.replace(/~/g, "~0").replace(/\//g, "~1") + "/values/" + i1, schemaPath: "#/definitions/hexColor/type", keyword: "type", params: { type: "string" }, message: "must be string" }];
                                                            return false;
                                                          }
                                                        }
                                                        var valid18 = _errs69 === errors;
                                                        if (!valid18) {
                                                          break;
                                                        }
                                                      }
                                                    }
                                                  }
                                                } else {
                                                  validate10.errors = [{ instancePath: instancePath + "/colors/" + key9.replace(/~/g, "~0").replace(/\//g, "~1") + "/values", schemaPath: "#/properties/colors/additionalProperties/properties/values/type", keyword: "type", params: { type: "array" }, message: "must be array" }];
                                                  return false;
                                                }
                                              }
                                              var valid17 = _errs67 === errors;
                                            } else {
                                              var valid17 = true;
                                            }
                                            if (valid17) {
                                              if (data23.notEqualTo !== void 0) {
                                                let data26 = data23.notEqualTo;
                                                const _errs72 = errors;
                                                if (errors === _errs72) {
                                                  if (Array.isArray(data26)) {
                                                    if (data26.length > 64) {
                                                      validate10.errors = [{ instancePath: instancePath + "/colors/" + key9.replace(/~/g, "~0").replace(/\//g, "~1") + "/notEqualTo", schemaPath: "#/properties/colors/additionalProperties/properties/notEqualTo/maxItems", keyword: "maxItems", params: { limit: 64 }, message: "must NOT have more than 64 items" }];
                                                      return false;
                                                    } else {
                                                      var valid20 = true;
                                                      const len2 = data26.length;
                                                      for (let i2 = 0; i2 < len2; i2++) {
                                                        const _errs74 = errors;
                                                        if (!validate25(data26[i2], { instancePath: instancePath + "/colors/" + key9.replace(/~/g, "~0").replace(/\//g, "~1") + "/notEqualTo/" + i2, parentData: data26, parentDataProperty: i2, rootData })) {
                                                          vErrors = vErrors === null ? validate25.errors : vErrors.concat(validate25.errors);
                                                          errors = vErrors.length;
                                                        }
                                                        var valid20 = _errs74 === errors;
                                                        if (!valid20) {
                                                          break;
                                                        }
                                                      }
                                                    }
                                                  } else {
                                                    validate10.errors = [{ instancePath: instancePath + "/colors/" + key9.replace(/~/g, "~0").replace(/\//g, "~1") + "/notEqualTo", schemaPath: "#/properties/colors/additionalProperties/properties/notEqualTo/type", keyword: "type", params: { type: "array" }, message: "must be array" }];
                                                    return false;
                                                  }
                                                }
                                                var valid17 = _errs72 === errors;
                                              } else {
                                                var valid17 = true;
                                              }
                                              if (valid17) {
                                                if (data23.contrastTo !== void 0) {
                                                  const _errs75 = errors;
                                                  if (!validate25(data23.contrastTo, { instancePath: instancePath + "/colors/" + key9.replace(/~/g, "~0").replace(/\//g, "~1") + "/contrastTo", parentData: data23, parentDataProperty: "contrastTo", rootData })) {
                                                    vErrors = vErrors === null ? validate25.errors : vErrors.concat(validate25.errors);
                                                    errors = vErrors.length;
                                                  }
                                                  var valid17 = _errs75 === errors;
                                                } else {
                                                  var valid17 = true;
                                                }
                                              }
                                            }
                                          }
                                        }
                                      } else {
                                        validate10.errors = [{ instancePath: instancePath + "/colors/" + key9.replace(/~/g, "~0").replace(/\//g, "~1"), schemaPath: "#/properties/colors/additionalProperties/type", keyword: "type", params: { type: "object" }, message: "must be object" }];
                                        return false;
                                      }
                                    }
                                    var valid16 = _errs64 === errors;
                                    if (!valid16) {
                                      break;
                                    }
                                  }
                                }
                              }
                            } else {
                              validate10.errors = [{ instancePath: instancePath + "/colors", schemaPath: "#/properties/colors/type", keyword: "type", params: { type: "object" }, message: "must be object" }];
                              return false;
                            }
                          }
                          var valid0 = _errs58 === errors;
                        } else {
                          var valid0 = true;
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    } else {
      validate10.errors = [{ instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" }];
      return false;
    }
  }
  validate10.errors = vErrors;
  return errors === 0;
}
var StyleValidator = class {
  static validate(data) {
    if (!validate10(data)) {
      throw new StyleValidationError(validate10.errors || []);
    }
  }
};

// node_modules/@dicebear/core/lib/Style/MetaLicense.js
var __classPrivateFieldSet = function(receiver, state, value, kind, f) {
  if (kind === "m") throw new TypeError("Private method is not writable");
  if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a setter");
  if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
  return kind === "a" ? f.call(receiver, value) : f ? f.value = value : state.set(receiver, value), value;
};
var __classPrivateFieldGet = function(receiver, state, kind, f) {
  if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
  if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
  return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
};
var _MetaLicense_data;
var MetaLicense = class {
  constructor(data) {
    _MetaLicense_data.set(this, void 0);
    __classPrivateFieldSet(this, _MetaLicense_data, data, "f");
  }
  /**
   * Returns the license name (e.g. `"CC BY 4.0"`), or `undefined` when not set.
   */
  name() {
    return __classPrivateFieldGet(this, _MetaLicense_data, "f").name;
  }
  /**
   * Returns the license URL, or `undefined` when not set.
   */
  url() {
    return __classPrivateFieldGet(this, _MetaLicense_data, "f").url;
  }
  /**
   * Returns the full license text, or `undefined` when not set.
   */
  text() {
    return __classPrivateFieldGet(this, _MetaLicense_data, "f").text;
  }
};
_MetaLicense_data = /* @__PURE__ */ new WeakMap();

// node_modules/@dicebear/core/lib/Style/MetaCreator.js
var __classPrivateFieldSet2 = function(receiver, state, value, kind, f) {
  if (kind === "m") throw new TypeError("Private method is not writable");
  if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a setter");
  if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
  return kind === "a" ? f.call(receiver, value) : f ? f.value = value : state.set(receiver, value), value;
};
var __classPrivateFieldGet2 = function(receiver, state, kind, f) {
  if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
  if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
  return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
};
var _MetaCreator_data;
var MetaCreator = class {
  constructor(data) {
    _MetaCreator_data.set(this, void 0);
    __classPrivateFieldSet2(this, _MetaCreator_data, data, "f");
  }
  /**
   * Returns the creator's display name, or `undefined` when not set.
   */
  name() {
    return __classPrivateFieldGet2(this, _MetaCreator_data, "f").name;
  }
  /**
   * Returns the creator's homepage URL, or `undefined` when not set.
   */
  url() {
    return __classPrivateFieldGet2(this, _MetaCreator_data, "f").url;
  }
};
_MetaCreator_data = /* @__PURE__ */ new WeakMap();

// node_modules/@dicebear/core/lib/Style/MetaSource.js
var __classPrivateFieldSet3 = function(receiver, state, value, kind, f) {
  if (kind === "m") throw new TypeError("Private method is not writable");
  if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a setter");
  if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
  return kind === "a" ? f.call(receiver, value) : f ? f.value = value : state.set(receiver, value), value;
};
var __classPrivateFieldGet3 = function(receiver, state, kind, f) {
  if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
  if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
  return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
};
var _MetaSource_data;
var MetaSource = class {
  constructor(data) {
    _MetaSource_data.set(this, void 0);
    __classPrivateFieldSet3(this, _MetaSource_data, data, "f");
  }
  /**
   * Returns the source name (e.g. the original work title), or `undefined`
   * when not set.
   */
  name() {
    return __classPrivateFieldGet3(this, _MetaSource_data, "f").name;
  }
  /**
   * Returns the URL of the source, or `undefined` when not set.
   */
  url() {
    return __classPrivateFieldGet3(this, _MetaSource_data, "f").url;
  }
};
_MetaSource_data = /* @__PURE__ */ new WeakMap();

// node_modules/@dicebear/core/lib/Style/Meta.js
var __classPrivateFieldSet4 = function(receiver, state, value, kind, f) {
  if (kind === "m") throw new TypeError("Private method is not writable");
  if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a setter");
  if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
  return kind === "a" ? f.call(receiver, value) : f ? f.value = value : state.set(receiver, value), value;
};
var __classPrivateFieldGet4 = function(receiver, state, kind, f) {
  if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
  if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
  return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
};
var _Meta_data;
var _Meta_license;
var _Meta_creator;
var _Meta_source;
var Meta = class {
  constructor(data) {
    _Meta_data.set(this, void 0);
    _Meta_license.set(this, void 0);
    _Meta_creator.set(this, void 0);
    _Meta_source.set(this, void 0);
    __classPrivateFieldSet4(this, _Meta_data, data, "f");
  }
  /**
   * Returns the license descriptor, defaulting to an empty object when the
   * style definition omits the field.
   */
  license() {
    __classPrivateFieldSet4(this, _Meta_license, __classPrivateFieldGet4(this, _Meta_license, "f") ?? new MetaLicense(__classPrivateFieldGet4(this, _Meta_data, "f").license ?? {}), "f");
    return __classPrivateFieldGet4(this, _Meta_license, "f");
  }
  /**
   * Returns the creator descriptor, defaulting to an empty object when the
   * style definition omits the field.
   */
  creator() {
    __classPrivateFieldSet4(this, _Meta_creator, __classPrivateFieldGet4(this, _Meta_creator, "f") ?? new MetaCreator(__classPrivateFieldGet4(this, _Meta_data, "f").creator ?? {}), "f");
    return __classPrivateFieldGet4(this, _Meta_creator, "f");
  }
  /**
   * Returns the source descriptor, defaulting to an empty object when the
   * style definition omits the field.
   */
  source() {
    __classPrivateFieldSet4(this, _Meta_source, __classPrivateFieldGet4(this, _Meta_source, "f") ?? new MetaSource(__classPrivateFieldGet4(this, _Meta_data, "f").source ?? {}), "f");
    return __classPrivateFieldGet4(this, _Meta_source, "f");
  }
};
_Meta_data = /* @__PURE__ */ new WeakMap(), _Meta_license = /* @__PURE__ */ new WeakMap(), _Meta_creator = /* @__PURE__ */ new WeakMap(), _Meta_source = /* @__PURE__ */ new WeakMap();

// node_modules/@dicebear/core/lib/Style/Element.js
var __classPrivateFieldSet5 = function(receiver, state, value, kind, f) {
  if (kind === "m") throw new TypeError("Private method is not writable");
  if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a setter");
  if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
  return kind === "a" ? f.call(receiver, value) : f ? f.value = value : state.set(receiver, value), value;
};
var __classPrivateFieldGet5 = function(receiver, state, kind, f) {
  if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
  if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
  return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
};
var _Element_data;
var _Element_children;
var Element = class _Element {
  constructor(data) {
    _Element_data.set(this, void 0);
    _Element_children.set(this, void 0);
    __classPrivateFieldSet5(this, _Element_data, data, "f");
  }
  /**
   * Returns the element type discriminator (`svg`, `text`, `component`, …).
   */
  type() {
    return __classPrivateFieldGet5(this, _Element_data, "f").type;
  }
  /**
   * Returns the element's tag/component name, or `undefined` for elements
   * that don't have one.
   */
  name() {
    return __classPrivateFieldGet5(this, _Element_data, "f").name;
  }
  /**
   * Returns the element's textual value (for `text` elements) or template
   * fragment, or `undefined` when not applicable.
   */
  value() {
    return __classPrivateFieldGet5(this, _Element_data, "f").value;
  }
  /**
   * Returns the element's raw attribute map, or `undefined` when no
   * attributes are defined.
   */
  attributes() {
    return __classPrivateFieldGet5(this, _Element_data, "f").attributes;
  }
  /**
   * Returns the element's children, lazily wrapped as {@link Element}
   * instances on first access.
   */
  children() {
    __classPrivateFieldSet5(this, _Element_children, __classPrivateFieldGet5(this, _Element_children, "f") ?? (__classPrivateFieldGet5(this, _Element_data, "f").children ?? []).map((child) => new _Element(child)), "f");
    return __classPrivateFieldGet5(this, _Element_children, "f");
  }
};
_Element_data = /* @__PURE__ */ new WeakMap(), _Element_children = /* @__PURE__ */ new WeakMap();

// node_modules/@dicebear/core/lib/Style/Canvas.js
var __classPrivateFieldSet6 = function(receiver, state, value, kind, f) {
  if (kind === "m") throw new TypeError("Private method is not writable");
  if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a setter");
  if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
  return kind === "a" ? f.call(receiver, value) : f ? f.value = value : state.set(receiver, value), value;
};
var __classPrivateFieldGet6 = function(receiver, state, kind, f) {
  if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
  if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
  return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
};
var _Canvas_data;
var _Canvas_elements;
var Canvas = class {
  constructor(data) {
    _Canvas_data.set(this, void 0);
    _Canvas_elements.set(this, void 0);
    __classPrivateFieldSet6(this, _Canvas_data, data, "f");
  }
  /**
   * Returns the canvas width — the `width` value of the SVG `viewBox`.
   */
  width() {
    return __classPrivateFieldGet6(this, _Canvas_data, "f").width;
  }
  /**
   * Returns the canvas height — the `height` value of the SVG `viewBox`.
   */
  height() {
    return __classPrivateFieldGet6(this, _Canvas_data, "f").height;
  }
  /**
   * Returns the top-level elements rendered onto the canvas, lazily wrapped
   * as {@link Element} instances on first access.
   */
  elements() {
    __classPrivateFieldSet6(this, _Canvas_elements, __classPrivateFieldGet6(this, _Canvas_elements, "f") ?? __classPrivateFieldGet6(this, _Canvas_data, "f").elements.map((el) => new Element(el)), "f");
    return __classPrivateFieldGet6(this, _Canvas_elements, "f");
  }
};
_Canvas_data = /* @__PURE__ */ new WeakMap(), _Canvas_elements = /* @__PURE__ */ new WeakMap();

// node_modules/@dicebear/core/lib/Style/ComponentTranslate.js
var __classPrivateFieldSet7 = function(receiver, state, value, kind, f) {
  if (kind === "m") throw new TypeError("Private method is not writable");
  if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a setter");
  if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
  return kind === "a" ? f.call(receiver, value) : f ? f.value = value : state.set(receiver, value), value;
};
var __classPrivateFieldGet7 = function(receiver, state, kind, f) {
  if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
  if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
  return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
};
var _ComponentTranslate_data;
var ComponentTranslate = class {
  constructor(data) {
    _ComponentTranslate_data.set(this, void 0);
    __classPrivateFieldSet7(this, _ComponentTranslate_data, data, "f");
  }
  x() {
    return __classPrivateFieldGet7(this, _ComponentTranslate_data, "f").x;
  }
  y() {
    return __classPrivateFieldGet7(this, _ComponentTranslate_data, "f").y;
  }
};
_ComponentTranslate_data = /* @__PURE__ */ new WeakMap();

// node_modules/@dicebear/core/lib/Style/ComponentVariant.js
var __classPrivateFieldSet8 = function(receiver, state, value, kind, f) {
  if (kind === "m") throw new TypeError("Private method is not writable");
  if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a setter");
  if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
  return kind === "a" ? f.call(receiver, value) : f ? f.value = value : state.set(receiver, value), value;
};
var __classPrivateFieldGet8 = function(receiver, state, kind, f) {
  if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
  if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
  return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
};
var _ComponentVariant_data;
var _ComponentVariant_elements;
var ComponentVariant = class {
  constructor(data) {
    _ComponentVariant_data.set(this, void 0);
    _ComponentVariant_elements.set(this, void 0);
    __classPrivateFieldSet8(this, _ComponentVariant_data, data, "f");
  }
  /**
   * Returns the variant's elements, lazily wrapped as {@link Element}
   * instances on first access.
   */
  elements() {
    __classPrivateFieldSet8(this, _ComponentVariant_elements, __classPrivateFieldGet8(this, _ComponentVariant_elements, "f") ?? __classPrivateFieldGet8(this, _ComponentVariant_data, "f").elements.map((el) => new Element(el)), "f");
    return __classPrivateFieldGet8(this, _ComponentVariant_elements, "f");
  }
  /**
   * Returns the weighted-pick weight for this variant, defaulting to `1`.
   */
  weight() {
    return __classPrivateFieldGet8(this, _ComponentVariant_data, "f").weight ?? 1;
  }
  /**
   * Returns the variant's descriptive tags (e.g. `hairLength:long`), or an
   * empty list when none are authored. Consumed by the `tags` render option
   * to filter the variant pool.
   */
  tags() {
    return __classPrivateFieldGet8(this, _ComponentVariant_data, "f").tags ?? [];
  }
  /**
   * Tests this variant against a single tag-filter token's grammar. With no
   * `value`, it matches a whole category: the bare `category` tag or any
   * `category:value` tag. With a `value`, it matches only the exact
   * `category:value` tag. The resolver composes these checks into the
   * allow/disallow filter structure.
   */
  hasTag(category, value) {
    if (value === void 0) {
      return this.tags().some((tag) => tag === category || tag.startsWith(`${category}:`));
    }
    return this.tags().includes(`${category}:${value}`);
  }
};
_ComponentVariant_data = /* @__PURE__ */ new WeakMap(), _ComponentVariant_elements = /* @__PURE__ */ new WeakMap();

// node_modules/@dicebear/core/lib/Style/Component.js
var __classPrivateFieldSet9 = function(receiver, state, value, kind, f) {
  if (kind === "m") throw new TypeError("Private method is not writable");
  if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a setter");
  if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
  return kind === "a" ? f.call(receiver, value) : f ? f.value = value : state.set(receiver, value), value;
};
var __classPrivateFieldGet9 = function(receiver, state, kind, f) {
  if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
  if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
  return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
};
var _Component_instances;
var _Component_data;
var _Component_name;
var _Component_source;
var _Component_translate;
var _Component_variants;
var _Component_asBase;
var Component = class {
  constructor(name, data, source) {
    _Component_instances.add(this);
    _Component_data.set(this, void 0);
    _Component_name.set(this, void 0);
    _Component_source.set(this, void 0);
    _Component_translate.set(this, void 0);
    _Component_variants.set(this, void 0);
    __classPrivateFieldSet9(this, _Component_data, data, "f");
    __classPrivateFieldSet9(this, _Component_name, name, "f");
    __classPrivateFieldSet9(this, _Component_source, source, "f");
  }
  /**
   * Returns the entry's own name as declared in the style definition. For
   * aliases this is the alias key, not the source component's name (use
   * {@link sourceName} for the canonical user-option key prefix).
   */
  name() {
    return __classPrivateFieldGet9(this, _Component_name, "f");
  }
  /**
   * Returns the source component name when this entry is an alias, or
   * `undefined` for a base component.
   */
  extendsName() {
    return "extends" in __classPrivateFieldGet9(this, _Component_data, "f") ? __classPrivateFieldGet9(this, _Component_data, "f").extends : void 0;
  }
  /**
   * Returns the canonical user-option key prefix: the source component's
   * name when this entry is an alias, otherwise the entry's own name.
   */
  sourceName() {
    return this.extendsName() ?? __classPrivateFieldGet9(this, _Component_name, "f");
  }
  /**
   * Returns the component's intrinsic width in canvas coordinates. For
   * aliases the source component's width is returned.
   */
  width() {
    return __classPrivateFieldGet9(this, _Component_source, "f") ? __classPrivateFieldGet9(this, _Component_source, "f").width() : __classPrivateFieldGet9(this, _Component_instances, "m", _Component_asBase).call(this).width;
  }
  /**
   * Returns the component's intrinsic height in canvas coordinates. For
   * aliases the source component's height is returned.
   */
  height() {
    return __classPrivateFieldGet9(this, _Component_source, "f") ? __classPrivateFieldGet9(this, _Component_source, "f").height() : __classPrivateFieldGet9(this, _Component_instances, "m", _Component_asBase).call(this).height;
  }
  /**
   * Returns the probability (0–100) that this component is rendered.
   * Aliases delegate to the source; defaults to 100 (always visible).
   */
  probability() {
    if (__classPrivateFieldGet9(this, _Component_source, "f")) {
      return __classPrivateFieldGet9(this, _Component_source, "f").probability();
    }
    return __classPrivateFieldGet9(this, _Component_instances, "m", _Component_asBase).call(this).probability ?? 100;
  }
  /**
   * Returns the rotation range, or `undefined` when unset.
   * Aliases delegate to the source.
   */
  rotate() {
    return __classPrivateFieldGet9(this, _Component_source, "f") ? __classPrivateFieldGet9(this, _Component_source, "f").rotate() : __classPrivateFieldGet9(this, _Component_instances, "m", _Component_asBase).call(this).rotate;
  }
  /**
   * Returns the scale range, or `undefined` when unset.
   * Aliases delegate to the source.
   */
  scale() {
    return __classPrivateFieldGet9(this, _Component_source, "f") ? __classPrivateFieldGet9(this, _Component_source, "f").scale() : __classPrivateFieldGet9(this, _Component_instances, "m", _Component_asBase).call(this).scale;
  }
  /**
   * Returns the translate descriptor. Aliases delegate to the source.
   */
  translate() {
    if (__classPrivateFieldGet9(this, _Component_source, "f")) {
      return __classPrivateFieldGet9(this, _Component_source, "f").translate();
    }
    __classPrivateFieldSet9(this, _Component_translate, __classPrivateFieldGet9(this, _Component_translate, "f") ?? new ComponentTranslate(__classPrivateFieldGet9(this, _Component_instances, "m", _Component_asBase).call(this).translate ?? {}), "f");
    return __classPrivateFieldGet9(this, _Component_translate, "f");
  }
  /**
   * Returns a name → {@link ComponentVariant} map for all defined variants.
   * Aliases delegate to the source component's variants.
   */
  variants() {
    if (__classPrivateFieldGet9(this, _Component_source, "f")) {
      return __classPrivateFieldGet9(this, _Component_source, "f").variants();
    }
    __classPrivateFieldSet9(this, _Component_variants, __classPrivateFieldGet9(this, _Component_variants, "f") ?? new Map(Object.entries(__classPrivateFieldGet9(this, _Component_instances, "m", _Component_asBase).call(this).variants).map(([name, data]) => [
      name,
      new ComponentVariant(data)
    ])), "f");
    return __classPrivateFieldGet9(this, _Component_variants, "f");
  }
};
_Component_data = /* @__PURE__ */ new WeakMap(), _Component_name = /* @__PURE__ */ new WeakMap(), _Component_source = /* @__PURE__ */ new WeakMap(), _Component_translate = /* @__PURE__ */ new WeakMap(), _Component_variants = /* @__PURE__ */ new WeakMap(), _Component_instances = /* @__PURE__ */ new WeakSet(), _Component_asBase = function _Component_asBase2() {
  return __classPrivateFieldGet9(this, _Component_data, "f");
};

// node_modules/@dicebear/core/lib/Style/Color.js
var __classPrivateFieldSet10 = function(receiver, state, value, kind, f) {
  if (kind === "m") throw new TypeError("Private method is not writable");
  if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a setter");
  if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
  return kind === "a" ? f.call(receiver, value) : f ? f.value = value : state.set(receiver, value), value;
};
var __classPrivateFieldGet10 = function(receiver, state, kind, f) {
  if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
  if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
  return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
};
var _Color_data;
var Color = class {
  constructor(data) {
    _Color_data.set(this, void 0);
    __classPrivateFieldSet10(this, _Color_data, data, "f");
  }
  /**
   * Returns the candidate color values, in definition order.
   */
  values() {
    return __classPrivateFieldGet10(this, _Color_data, "f").values;
  }
  /**
   * Returns the colors that the resolver should avoid picking, or an empty
   * list when the field is unset.
   */
  notEqualTo() {
    return __classPrivateFieldGet10(this, _Color_data, "f").notEqualTo ?? [];
  }
  /**
   * Returns the name of another color that this one should contrast against,
   * or `undefined` when no contrast constraint is defined.
   */
  contrastTo() {
    return __classPrivateFieldGet10(this, _Color_data, "f").contrastTo;
  }
};
_Color_data = /* @__PURE__ */ new WeakMap();

// node_modules/@dicebear/core/lib/Style.js
var __classPrivateFieldSet11 = function(receiver, state, value, kind, f) {
  if (kind === "m") throw new TypeError("Private method is not writable");
  if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a setter");
  if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
  return kind === "a" ? f.call(receiver, value) : f ? f.value = value : state.set(receiver, value), value;
};
var __classPrivateFieldGet11 = function(receiver, state, kind, f) {
  if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
  if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
  return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
};
var _Style_instances;
var _a;
var _Style_data;
var _Style_meta;
var _Style_canvas;
var _Style_components;
var _Style_colors;
var _Style_validateAliases;
var _Style_isAlias;
var Style = class {
  constructor(data) {
    _Style_instances.add(this);
    _Style_data.set(this, void 0);
    _Style_meta.set(this, void 0);
    _Style_canvas.set(this, void 0);
    _Style_components.set(this, void 0);
    _Style_colors.set(this, void 0);
    StyleValidator.validate(data);
    __classPrivateFieldSet11(this, _Style_data, structuredClone(data), "f");
    __classPrivateFieldGet11(this, _Style_instances, "m", _Style_validateAliases).call(this);
  }
  /**
   * Returns the definition's `$id`, or `undefined` when not set.
   */
  id() {
    return __classPrivateFieldGet11(this, _Style_data, "f").$id;
  }
  /**
   * Returns the definition's `$schema` URI, or `undefined` when not set.
   */
  schema() {
    return __classPrivateFieldGet11(this, _Style_data, "f").$schema;
  }
  /**
   * Returns the definition's `$comment`, or `undefined` when not set.
   */
  comment() {
    return __classPrivateFieldGet11(this, _Style_data, "f").$comment;
  }
  /**
   * Returns the {@link Meta} view, lazily constructed on first access.
   */
  meta() {
    __classPrivateFieldSet11(this, _Style_meta, __classPrivateFieldGet11(this, _Style_meta, "f") ?? new Meta(__classPrivateFieldGet11(this, _Style_data, "f").meta ?? {}), "f");
    return __classPrivateFieldGet11(this, _Style_meta, "f");
  }
  /**
   * Returns a deep clone of the root SVG attributes from the definition,
   * defaulting to an empty object.
   */
  attributes() {
    return structuredClone(__classPrivateFieldGet11(this, _Style_data, "f").attributes ?? {});
  }
  /**
   * Returns a deep clone of the underlying definition.
   */
  definition() {
    return structuredClone(__classPrivateFieldGet11(this, _Style_data, "f"));
  }
  /**
   * Returns the {@link Canvas} view, lazily constructed on first access.
   */
  canvas() {
    __classPrivateFieldSet11(this, _Style_canvas, __classPrivateFieldGet11(this, _Style_canvas, "f") ?? new Canvas(__classPrivateFieldGet11(this, _Style_data, "f").canvas), "f");
    return __classPrivateFieldGet11(this, _Style_canvas, "f");
  }
  /**
   * Returns a name → {@link Component} map for all defined components, built
   * lazily on first access.
   */
  components() {
    if (__classPrivateFieldGet11(this, _Style_components, "f")) {
      return __classPrivateFieldGet11(this, _Style_components, "f");
    }
    const entries = Object.entries(__classPrivateFieldGet11(this, _Style_data, "f").components ?? {});
    const map = /* @__PURE__ */ new Map();
    for (const [name, data] of entries) {
      if (!__classPrivateFieldGet11(_a, _a, "m", _Style_isAlias).call(_a, data)) {
        map.set(name, new Component(name, data));
      }
    }
    for (const [name, data] of entries) {
      if (__classPrivateFieldGet11(_a, _a, "m", _Style_isAlias).call(_a, data)) {
        map.set(name, new Component(name, data, map.get(data.extends)));
      }
    }
    __classPrivateFieldSet11(this, _Style_components, map, "f");
    return __classPrivateFieldGet11(this, _Style_components, "f");
  }
  /**
   * Returns a name → {@link Color} map for all defined colors, built lazily
   * on first access.
   */
  colors() {
    __classPrivateFieldSet11(this, _Style_colors, __classPrivateFieldGet11(this, _Style_colors, "f") ?? new Map(Object.entries(__classPrivateFieldGet11(this, _Style_data, "f").colors ?? {}).map(([name, data]) => [
      name,
      new Color(data)
    ])), "f");
    return __classPrivateFieldGet11(this, _Style_colors, "f");
  }
};
_a = Style, _Style_data = /* @__PURE__ */ new WeakMap(), _Style_meta = /* @__PURE__ */ new WeakMap(), _Style_canvas = /* @__PURE__ */ new WeakMap(), _Style_components = /* @__PURE__ */ new WeakMap(), _Style_colors = /* @__PURE__ */ new WeakMap(), _Style_instances = /* @__PURE__ */ new WeakSet(), _Style_validateAliases = function _Style_validateAliases2() {
  const components = __classPrivateFieldGet11(this, _Style_data, "f").components;
  if (!components) {
    return;
  }
  const errors = [];
  for (const [name, data] of Object.entries(components)) {
    if (!__classPrivateFieldGet11(_a, _a, "m", _Style_isAlias).call(_a, data)) {
      continue;
    }
    const target = data.extends;
    const targetData = components[target];
    if (!targetData) {
      errors.push({
        instancePath: `/components/${name}/extends`,
        message: `references unknown component "${target}"`
      });
      continue;
    }
    if (__classPrivateFieldGet11(_a, _a, "m", _Style_isAlias).call(_a, targetData)) {
      errors.push({
        instancePath: `/components/${name}/extends`,
        message: `references alias "${target}" \u2014 alias chains are not allowed`
      });
    }
  }
  if (errors.length > 0) {
    throw new StyleValidationError(errors);
  }
}, _Style_isAlias = function _Style_isAlias2(data) {
  return "extends" in data;
};

// node_modules/@dicebear/core/lib/Error/OptionsValidationError.js
var OptionsValidationError = class extends ValidationError {
  constructor(details) {
    super("Invalid options", details);
    this.name = "OptionsValidationError";
  }
};

// node_modules/@dicebear/core/lib/Validator/OptionsValidator.js
function ucs2length2(str) {
  let n = 0;
  for (const _ of str)
    n++;
  return n;
}
var schema11 = { "$id": "https://cdn.hopjs.net/npm/@dicebear/schema@1.3.0/dist/options.min.json", "$schema": "http://json-schema.org/draft-07/schema#", "title": "DiceBear options schema", "type": "object", "definitions": { "flip": { "type": "string", "enum": ["none", "horizontal", "vertical", "both"] }, "rotate": { "type": "number", "minimum": -360, "maximum": 360 }, "scale": { "type": "number", "minimum": 0, "maximum": 10 }, "translate": { "type": "number", "minimum": -1e3, "maximum": 1e3 }, "borderRadius": { "type": "number", "minimum": 0, "maximum": 50 }, "color": { "type": "string", "pattern": "^#?([a-fA-F0-9]{3}|[a-fA-F0-9]{4}|[a-fA-F0-9]{6}|[a-fA-F0-9]{8})$" }, "colorFill": { "type": "string", "enum": ["solid", "linear", "radial"] }, "colorFillStops": { "type": "integer", "minimum": 2 }, "fontFamilyName": { "type": "string", "pattern": "^[a-zA-Z0-9_\\-]+( [a-zA-Z0-9_\\-]+)*(, ?[a-zA-Z0-9_\\-]+( [a-zA-Z0-9_\\-]+)*)*$", "maxLength": 256 }, "fontWeight": { "type": "integer", "minimum": 1, "maximum": 1e3 }, "variantName": { "type": "string", "pattern": "^[a-z][a-zA-Z0-9]*$", "maxLength": 64 }, "tagFilter": { "type": "string", "pattern": "^!?[a-z][a-zA-Z0-9]*(:[a-z][a-zA-Z0-9]*)?$", "maxLength": 130 }, "rotateOption": { "anyOf": [{ "$ref": "#/definitions/rotate" }, { "type": "array", "items": { "$ref": "#/definitions/rotate" }, "minItems": 0, "maxItems": 2 }] }, "translateOption": { "anyOf": [{ "$ref": "#/definitions/translate" }, { "type": "array", "items": { "$ref": "#/definitions/translate" }, "minItems": 0, "maxItems": 2 }] }, "scaleOption": { "anyOf": [{ "$ref": "#/definitions/scale" }, { "type": "array", "items": { "$ref": "#/definitions/scale" }, "minItems": 0, "maxItems": 2 }] } }, "properties": { "seed": { "type": "string", "description": "The starting value for the pseudorandom number generator (PRNG) used in the avatar generation process. This option is essential for creating unique and consistent avatars. By setting a specific seed, you ensure that the same sequence of random characteristics is applied, allowing identical avatars to be reproduced. This is especially valuable for maintaining consistency across sessions and allowing users to share or recreate their personalized avatars.", "maxLength": 1024 }, "size": { "type": "integer", "description": "Specifies the dimensions of the avatar in pixels. If no size is specified, the avatar defaults to a responsive design or scales to 100% of its container. This flexibility allows the avatar to seamlessly adapt to different screen sizes and layouts, ensuring optimal display across devices and environments.", "minimum": 1, "maximum": 4096 }, "idRandomization": { "type": "boolean", "description": "Generates random values for all IDs present in the SVG. This process ensures that while the avatar appears visually identical, the underlying code remains unique. This is particularly useful for embedding the same avatar multiple times in a document without running into duplicate ID conflicts that can interfere with styles and scripts." }, "title": { "type": "string", "description": "Specifies an accessible title for the avatar. When set, the SVG will include a <title> element and an aria-label attribute, allowing screen readers and other assistive technologies to describe the avatar to users.", "maxLength": 256 }, "flip": { "description": "Specifies how the avatar will be flipped. Options include `none` for no flip, `horizontal` for a left-to-right flip, `vertical` for an upside-down flip, and `both` for a complete flip. If specified as an array, the PRNG will choose from the available options.", "anyOf": [{ "$ref": "#/definitions/flip" }, { "type": "array", "items": { "$ref": "#/definitions/flip" }, "minItems": 0, "maxItems": 4 }] }, "fontFamily": { "description": "Specifies the font family used for text rendering. If specified as an array, the PRNG will choose from the available options.", "anyOf": [{ "$ref": "#/definitions/fontFamilyName" }, { "type": "array", "items": { "$ref": "#/definitions/fontFamilyName" }, "minItems": 0, "maxItems": 128 }] }, "fontWeight": { "description": "Specifies the font weight used for text rendering. The value must be an integer between 1 and 1000. If specified as an array, the PRNG will choose from the available options.", "anyOf": [{ "$ref": "#/definitions/fontWeight" }, { "type": "array", "items": { "$ref": "#/definitions/fontWeight" }, "minItems": 0, "maxItems": 128 }] }, "scale": { "description": "Sets the scaling of the avatar. A value of `1` corresponds to the original size of the avatar. This setting affects the size of the avatar itself, but not the size of the avatar container; any excess content will be clipped. If specified as an array, the PRNG will select a value within the specified range, including the values themselves.", "allOf": [{ "$ref": "#/definitions/scaleOption" }] }, "borderRadius": { "description": "This is the radius of the corners of the avatar. This value can be a float or an integer. A value of 0 means that the avatar has sharp corners, while larger values result in more rounded corners. The maximum value is 50, which turns the avatar into a complete circle. If specified as an array, the PRNG will select a value within the specified range, including the values themselves.", "anyOf": [{ "$ref": "#/definitions/borderRadius" }, { "type": "array", "items": { "$ref": "#/definitions/borderRadius" }, "minItems": 0, "maxItems": 2 }] }, "tags": { "description": "Uses tags to filter which variants of the avatar's components the PRNG may select. Each token is `category` or `category:value` (e.g. `hairLength:long`), optionally prefixed with `!` to exclude. An include affects only its own category: it drops variants that carry a different value in that category and keeps variants that carry no tag there. An exclude removes variants carrying the named tag. Unknown tags are ignored. A `*Variant` option for the same component takes precedence: when set, it determines that component's variants and the tag filter does not apply to it. Can be a single string or an array of strings.", "anyOf": [{ "$ref": "#/definitions/tagFilter" }, { "type": "array", "items": { "$ref": "#/definitions/tagFilter" }, "minItems": 0, "maxItems": 128 }] } }, "patternProperties": { "^[a-z][a-zA-Z0-9]*Probability$": { "type": "number", "description": "Represents the probability that a component of the avatar will be displayed. The value can be either a float or an integer, but is interpreted as a percentage. For example, a value of 0 means the part will never be displayed, while a value of 100 means it will always be displayed.", "minimum": 0, "maximum": 100 }, "^[a-z][a-zA-Z0-9]*Variant$": { "description": "Specifies which variants of the avatar part can be selected by the PRNG and their relative weights. A string or array of strings filters which variants the PRNG can choose from. An object maps variant names to non-negative weights, simultaneously filtering and weighting selection. Variant names must be camelCase identifiers.", "anyOf": [{ "$ref": "#/definitions/variantName" }, { "type": "array", "items": { "$ref": "#/definitions/variantName" }, "minItems": 0, "maxItems": 128 }, { "type": "object", "propertyNames": { "$ref": "#/definitions/variantName" }, "additionalProperties": { "type": "number", "minimum": 0 }, "minProperties": 1, "maxProperties": 512 }] }, "^[a-z][a-zA-Z0-9]*Color$": { "description": "Specifies which colors for the avatar component can be selected by the PRNG. If specified as a string or array with only one value, the value is fixed. However, if specified as an array with multiple values, the PRNG will choose from the available options. The color must be specified as a hex value.", "anyOf": [{ "$ref": "#/definitions/color" }, { "type": "array", "items": { "$ref": "#/definitions/color" }, "minItems": 0, "maxItems": 128 }] }, "^[a-z][a-zA-Z0-9]*ColorFill$": { "description": "Specifies the color fill method for the avatar component. Options include `solid` for a flat color, `linear` for a linear gradient, and `radial` for a radial gradient. If specified as a string or array with only one value, the value is fixed. However, if specified as an array with multiple values, the PRNG will choose from the available options.", "anyOf": [{ "$ref": "#/definitions/colorFill" }, { "type": "array", "items": { "$ref": "#/definitions/colorFill" }, "minItems": 0, "maxItems": 128 }] }, "^[a-z][a-zA-Z0-9]*ColorFillStops$": { "description": "Specifies the number of color stops for gradient fills. This value is only relevant when the color fill method is set to `linear` or `radial`. The minimum value is 2. If specified as an array, the PRNG will select a value within the specified range, including the values themselves.", "anyOf": [{ "$ref": "#/definitions/colorFillStops" }, { "type": "array", "items": { "$ref": "#/definitions/colorFillStops" }, "minItems": 0, "maxItems": 2 }] }, "^[a-z][a-zA-Z0-9]*ColorAngle$": { "description": "Specifies the angle for the color gradient. This value can be an integer or a float. A value of 0 results in no rotation, while values between -360 and 360 define the degree of rotation. If specified as an array, the PRNG will select a value within the specified range, including the values themselves.", "allOf": [{ "$ref": "#/definitions/rotateOption" }] }, "^rotate$": { "description": "This is the rotation angle for the entire avatar. This value can be an integer or a float. A value of 0 results in no rotation, while values between -360 and 360 define the degree of rotation in both directions. If specified as an array, the PRNG will select a value within the specified range, including the values themselves.", "allOf": [{ "$ref": "#/definitions/rotateOption" }] }, "^translateY$": { "description": "This is the vertical translation of the entire avatar. This value can be an integer or a float. A value of 0 results in no translation, while positive values move the avatar down and negative values move it up. If specified as an array, the PRNG will select a value within the specified range, including the values themselves.", "allOf": [{ "$ref": "#/definitions/translateOption" }] }, "^translateX$": { "description": "This is the horizontal translation of the entire avatar. This value can be an integer or a float. A value of 0 results in no translation, while positive values move the avatar to the right and negative values move it to the left. If specified as an array, the PRNG will select a value within the specified range, including the values themselves.", "allOf": [{ "$ref": "#/definitions/translateOption" }] } }, "propertyNames": { "maxLength": 128 }, "additionalProperties": false, "maxProperties": 512 };
var schema12 = { "type": "string", "enum": ["none", "horizontal", "vertical", "both"] };
var schema30 = { "type": "string", "enum": ["solid", "linear", "radial"] };
var func22 = ucs2length2;
var func3 = Object.prototype.hasOwnProperty;
var pattern02 = new RegExp("^[a-z][a-zA-Z0-9]*Probability$", "u");
var pattern1 = new RegExp("^[a-z][a-zA-Z0-9]*Variant$", "u");
var pattern2 = new RegExp("^[a-z][a-zA-Z0-9]*Color$", "u");
var pattern32 = new RegExp("^[a-z][a-zA-Z0-9]*ColorFill$", "u");
var pattern42 = new RegExp("^[a-z][a-zA-Z0-9]*ColorFillStops$", "u");
var pattern52 = new RegExp("^[a-z][a-zA-Z0-9]*ColorAngle$", "u");
var pattern62 = new RegExp("^rotate$", "u");
var pattern72 = new RegExp("^translateY$", "u");
var pattern82 = new RegExp("^translateX$", "u");
var pattern92 = new RegExp("^[a-zA-Z0-9_\\-]+( [a-zA-Z0-9_\\-]+)*(, ?[a-zA-Z0-9_\\-]+( [a-zA-Z0-9_\\-]+)*)*$", "u");
var pattern11 = new RegExp("^!?[a-z][a-zA-Z0-9]*(:[a-z][a-zA-Z0-9]*)?$", "u");
var pattern15 = new RegExp("^[a-z][a-zA-Z0-9]*$", "u");
var pattern192 = new RegExp("^#?([a-fA-F0-9]{3}|[a-fA-F0-9]{4}|[a-fA-F0-9]{6}|[a-fA-F0-9]{8})$", "u");
function validate112(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  const _errs0 = errors;
  let valid0 = false;
  const _errs1 = errors;
  const _errs2 = errors;
  if (errors === _errs2) {
    if (typeof data == "number" && isFinite(data)) {
      if (data > 10 || isNaN(data)) {
        const err0 = { instancePath, schemaPath: "#/definitions/scale/maximum", keyword: "maximum", params: { comparison: "<=", limit: 10 }, message: "must be <= 10" };
        if (vErrors === null) {
          vErrors = [err0];
        } else {
          vErrors.push(err0);
        }
        errors++;
      } else {
        if (data < 0 || isNaN(data)) {
          const err1 = { instancePath, schemaPath: "#/definitions/scale/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
          if (vErrors === null) {
            vErrors = [err1];
          } else {
            vErrors.push(err1);
          }
          errors++;
        }
      }
    } else {
      const err2 = { instancePath, schemaPath: "#/definitions/scale/type", keyword: "type", params: { type: "number" }, message: "must be number" };
      if (vErrors === null) {
        vErrors = [err2];
      } else {
        vErrors.push(err2);
      }
      errors++;
    }
  }
  var _valid0 = _errs1 === errors;
  valid0 = valid0 || _valid0;
  if (!valid0) {
    const _errs4 = errors;
    if (errors === _errs4) {
      if (Array.isArray(data)) {
        if (data.length > 2) {
          const err3 = { instancePath, schemaPath: "#/anyOf/1/maxItems", keyword: "maxItems", params: { limit: 2 }, message: "must NOT have more than 2 items" };
          if (vErrors === null) {
            vErrors = [err3];
          } else {
            vErrors.push(err3);
          }
          errors++;
        } else {
          if (data.length < 0) {
            const err4 = { instancePath, schemaPath: "#/anyOf/1/minItems", keyword: "minItems", params: { limit: 0 }, message: "must NOT have fewer than 0 items" };
            if (vErrors === null) {
              vErrors = [err4];
            } else {
              vErrors.push(err4);
            }
            errors++;
          } else {
            var valid2 = true;
            const len0 = data.length;
            for (let i0 = 0; i0 < len0; i0++) {
              let data0 = data[i0];
              const _errs6 = errors;
              const _errs7 = errors;
              if (errors === _errs7) {
                if (typeof data0 == "number" && isFinite(data0)) {
                  if (data0 > 10 || isNaN(data0)) {
                    const err5 = { instancePath: instancePath + "/" + i0, schemaPath: "#/definitions/scale/maximum", keyword: "maximum", params: { comparison: "<=", limit: 10 }, message: "must be <= 10" };
                    if (vErrors === null) {
                      vErrors = [err5];
                    } else {
                      vErrors.push(err5);
                    }
                    errors++;
                  } else {
                    if (data0 < 0 || isNaN(data0)) {
                      const err6 = { instancePath: instancePath + "/" + i0, schemaPath: "#/definitions/scale/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
                      if (vErrors === null) {
                        vErrors = [err6];
                      } else {
                        vErrors.push(err6);
                      }
                      errors++;
                    }
                  }
                } else {
                  const err7 = { instancePath: instancePath + "/" + i0, schemaPath: "#/definitions/scale/type", keyword: "type", params: { type: "number" }, message: "must be number" };
                  if (vErrors === null) {
                    vErrors = [err7];
                  } else {
                    vErrors.push(err7);
                  }
                  errors++;
                }
              }
              var valid2 = _errs6 === errors;
              if (!valid2) {
                break;
              }
            }
          }
        }
      } else {
        const err8 = { instancePath, schemaPath: "#/anyOf/1/type", keyword: "type", params: { type: "array" }, message: "must be array" };
        if (vErrors === null) {
          vErrors = [err8];
        } else {
          vErrors.push(err8);
        }
        errors++;
      }
    }
    var _valid0 = _errs4 === errors;
    valid0 = valid0 || _valid0;
  }
  if (!valid0) {
    const err9 = { instancePath, schemaPath: "#/anyOf", keyword: "anyOf", params: {}, message: "must match a schema in anyOf" };
    if (vErrors === null) {
      vErrors = [err9];
    } else {
      vErrors.push(err9);
    }
    errors++;
    validate112.errors = vErrors;
    return false;
  } else {
    errors = _errs0;
    if (vErrors !== null) {
      if (_errs0) {
        vErrors.length = _errs0;
      } else {
        vErrors = null;
      }
    }
  }
  validate112.errors = vErrors;
  return errors === 0;
}
function validate13(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  const _errs0 = errors;
  let valid0 = false;
  const _errs1 = errors;
  const _errs2 = errors;
  if (errors === _errs2) {
    if (typeof data == "number" && isFinite(data)) {
      if (data > 360 || isNaN(data)) {
        const err0 = { instancePath, schemaPath: "#/definitions/rotate/maximum", keyword: "maximum", params: { comparison: "<=", limit: 360 }, message: "must be <= 360" };
        if (vErrors === null) {
          vErrors = [err0];
        } else {
          vErrors.push(err0);
        }
        errors++;
      } else {
        if (data < -360 || isNaN(data)) {
          const err1 = { instancePath, schemaPath: "#/definitions/rotate/minimum", keyword: "minimum", params: { comparison: ">=", limit: -360 }, message: "must be >= -360" };
          if (vErrors === null) {
            vErrors = [err1];
          } else {
            vErrors.push(err1);
          }
          errors++;
        }
      }
    } else {
      const err2 = { instancePath, schemaPath: "#/definitions/rotate/type", keyword: "type", params: { type: "number" }, message: "must be number" };
      if (vErrors === null) {
        vErrors = [err2];
      } else {
        vErrors.push(err2);
      }
      errors++;
    }
  }
  var _valid0 = _errs1 === errors;
  valid0 = valid0 || _valid0;
  if (!valid0) {
    const _errs4 = errors;
    if (errors === _errs4) {
      if (Array.isArray(data)) {
        if (data.length > 2) {
          const err3 = { instancePath, schemaPath: "#/anyOf/1/maxItems", keyword: "maxItems", params: { limit: 2 }, message: "must NOT have more than 2 items" };
          if (vErrors === null) {
            vErrors = [err3];
          } else {
            vErrors.push(err3);
          }
          errors++;
        } else {
          if (data.length < 0) {
            const err4 = { instancePath, schemaPath: "#/anyOf/1/minItems", keyword: "minItems", params: { limit: 0 }, message: "must NOT have fewer than 0 items" };
            if (vErrors === null) {
              vErrors = [err4];
            } else {
              vErrors.push(err4);
            }
            errors++;
          } else {
            var valid2 = true;
            const len0 = data.length;
            for (let i0 = 0; i0 < len0; i0++) {
              let data0 = data[i0];
              const _errs6 = errors;
              const _errs7 = errors;
              if (errors === _errs7) {
                if (typeof data0 == "number" && isFinite(data0)) {
                  if (data0 > 360 || isNaN(data0)) {
                    const err5 = { instancePath: instancePath + "/" + i0, schemaPath: "#/definitions/rotate/maximum", keyword: "maximum", params: { comparison: "<=", limit: 360 }, message: "must be <= 360" };
                    if (vErrors === null) {
                      vErrors = [err5];
                    } else {
                      vErrors.push(err5);
                    }
                    errors++;
                  } else {
                    if (data0 < -360 || isNaN(data0)) {
                      const err6 = { instancePath: instancePath + "/" + i0, schemaPath: "#/definitions/rotate/minimum", keyword: "minimum", params: { comparison: ">=", limit: -360 }, message: "must be >= -360" };
                      if (vErrors === null) {
                        vErrors = [err6];
                      } else {
                        vErrors.push(err6);
                      }
                      errors++;
                    }
                  }
                } else {
                  const err7 = { instancePath: instancePath + "/" + i0, schemaPath: "#/definitions/rotate/type", keyword: "type", params: { type: "number" }, message: "must be number" };
                  if (vErrors === null) {
                    vErrors = [err7];
                  } else {
                    vErrors.push(err7);
                  }
                  errors++;
                }
              }
              var valid2 = _errs6 === errors;
              if (!valid2) {
                break;
              }
            }
          }
        }
      } else {
        const err8 = { instancePath, schemaPath: "#/anyOf/1/type", keyword: "type", params: { type: "array" }, message: "must be array" };
        if (vErrors === null) {
          vErrors = [err8];
        } else {
          vErrors.push(err8);
        }
        errors++;
      }
    }
    var _valid0 = _errs4 === errors;
    valid0 = valid0 || _valid0;
  }
  if (!valid0) {
    const err9 = { instancePath, schemaPath: "#/anyOf", keyword: "anyOf", params: {}, message: "must match a schema in anyOf" };
    if (vErrors === null) {
      vErrors = [err9];
    } else {
      vErrors.push(err9);
    }
    errors++;
    validate13.errors = vErrors;
    return false;
  } else {
    errors = _errs0;
    if (vErrors !== null) {
      if (_errs0) {
        vErrors.length = _errs0;
      } else {
        vErrors = null;
      }
    }
  }
  validate13.errors = vErrors;
  return errors === 0;
}
function validate16(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  const _errs0 = errors;
  let valid0 = false;
  const _errs1 = errors;
  const _errs2 = errors;
  if (errors === _errs2) {
    if (typeof data == "number" && isFinite(data)) {
      if (data > 1e3 || isNaN(data)) {
        const err0 = { instancePath, schemaPath: "#/definitions/translate/maximum", keyword: "maximum", params: { comparison: "<=", limit: 1e3 }, message: "must be <= 1000" };
        if (vErrors === null) {
          vErrors = [err0];
        } else {
          vErrors.push(err0);
        }
        errors++;
      } else {
        if (data < -1e3 || isNaN(data)) {
          const err1 = { instancePath, schemaPath: "#/definitions/translate/minimum", keyword: "minimum", params: { comparison: ">=", limit: -1e3 }, message: "must be >= -1000" };
          if (vErrors === null) {
            vErrors = [err1];
          } else {
            vErrors.push(err1);
          }
          errors++;
        }
      }
    } else {
      const err2 = { instancePath, schemaPath: "#/definitions/translate/type", keyword: "type", params: { type: "number" }, message: "must be number" };
      if (vErrors === null) {
        vErrors = [err2];
      } else {
        vErrors.push(err2);
      }
      errors++;
    }
  }
  var _valid0 = _errs1 === errors;
  valid0 = valid0 || _valid0;
  if (!valid0) {
    const _errs4 = errors;
    if (errors === _errs4) {
      if (Array.isArray(data)) {
        if (data.length > 2) {
          const err3 = { instancePath, schemaPath: "#/anyOf/1/maxItems", keyword: "maxItems", params: { limit: 2 }, message: "must NOT have more than 2 items" };
          if (vErrors === null) {
            vErrors = [err3];
          } else {
            vErrors.push(err3);
          }
          errors++;
        } else {
          if (data.length < 0) {
            const err4 = { instancePath, schemaPath: "#/anyOf/1/minItems", keyword: "minItems", params: { limit: 0 }, message: "must NOT have fewer than 0 items" };
            if (vErrors === null) {
              vErrors = [err4];
            } else {
              vErrors.push(err4);
            }
            errors++;
          } else {
            var valid2 = true;
            const len0 = data.length;
            for (let i0 = 0; i0 < len0; i0++) {
              let data0 = data[i0];
              const _errs6 = errors;
              const _errs7 = errors;
              if (errors === _errs7) {
                if (typeof data0 == "number" && isFinite(data0)) {
                  if (data0 > 1e3 || isNaN(data0)) {
                    const err5 = { instancePath: instancePath + "/" + i0, schemaPath: "#/definitions/translate/maximum", keyword: "maximum", params: { comparison: "<=", limit: 1e3 }, message: "must be <= 1000" };
                    if (vErrors === null) {
                      vErrors = [err5];
                    } else {
                      vErrors.push(err5);
                    }
                    errors++;
                  } else {
                    if (data0 < -1e3 || isNaN(data0)) {
                      const err6 = { instancePath: instancePath + "/" + i0, schemaPath: "#/definitions/translate/minimum", keyword: "minimum", params: { comparison: ">=", limit: -1e3 }, message: "must be >= -1000" };
                      if (vErrors === null) {
                        vErrors = [err6];
                      } else {
                        vErrors.push(err6);
                      }
                      errors++;
                    }
                  }
                } else {
                  const err7 = { instancePath: instancePath + "/" + i0, schemaPath: "#/definitions/translate/type", keyword: "type", params: { type: "number" }, message: "must be number" };
                  if (vErrors === null) {
                    vErrors = [err7];
                  } else {
                    vErrors.push(err7);
                  }
                  errors++;
                }
              }
              var valid2 = _errs6 === errors;
              if (!valid2) {
                break;
              }
            }
          }
        }
      } else {
        const err8 = { instancePath, schemaPath: "#/anyOf/1/type", keyword: "type", params: { type: "array" }, message: "must be array" };
        if (vErrors === null) {
          vErrors = [err8];
        } else {
          vErrors.push(err8);
        }
        errors++;
      }
    }
    var _valid0 = _errs4 === errors;
    valid0 = valid0 || _valid0;
  }
  if (!valid0) {
    const err9 = { instancePath, schemaPath: "#/anyOf", keyword: "anyOf", params: {}, message: "must match a schema in anyOf" };
    if (vErrors === null) {
      vErrors = [err9];
    } else {
      vErrors.push(err9);
    }
    errors++;
    validate16.errors = vErrors;
    return false;
  } else {
    errors = _errs0;
    if (vErrors !== null) {
      if (_errs0) {
        vErrors.length = _errs0;
      } else {
        vErrors = null;
      }
    }
  }
  validate16.errors = vErrors;
  return errors === 0;
}
function validate102(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  ;
  let vErrors = null;
  let errors = 0;
  if (errors === 0) {
    if (data && typeof data == "object" && !Array.isArray(data)) {
      if (Object.keys(data).length > 512) {
        validate102.errors = [{ instancePath, schemaPath: "#/maxProperties", keyword: "maxProperties", params: { limit: 512 }, message: "must NOT have more than 512 properties" }];
        return false;
      } else {
        for (const key0 in data) {
          const _errs1 = errors;
          if (typeof key0 === "string") {
            if (func22(key0) > 128) {
              const err0 = { instancePath, schemaPath: "#/propertyNames/maxLength", keyword: "maxLength", params: { limit: 128 }, message: "must NOT have more than 128 characters", propertyName: key0 };
              if (vErrors === null) {
                vErrors = [err0];
              } else {
                vErrors.push(err0);
              }
              errors++;
            }
          }
          var valid0 = _errs1 === errors;
          if (!valid0) {
            const err1 = { instancePath, schemaPath: "#/propertyNames", keyword: "propertyNames", params: { propertyName: key0 }, message: "property name must be valid" };
            if (vErrors === null) {
              vErrors = [err1];
            } else {
              vErrors.push(err1);
            }
            errors++;
            validate102.errors = vErrors;
            return false;
            break;
          }
        }
        if (valid0) {
          const _errs2 = errors;
          for (const key1 in data) {
            if (!(func3.call(schema11.properties, key1) || pattern02.test(key1) || pattern1.test(key1) || pattern2.test(key1) || pattern32.test(key1) || pattern42.test(key1) || pattern52.test(key1) || pattern62.test(key1) || pattern72.test(key1) || pattern82.test(key1))) {
              validate102.errors = [{ instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" }];
              return false;
              break;
            }
          }
          if (_errs2 === errors) {
            if (data.seed !== void 0) {
              let data0 = data.seed;
              const _errs3 = errors;
              if (errors === _errs3) {
                if (typeof data0 === "string") {
                  if (func22(data0) > 1024) {
                    validate102.errors = [{ instancePath: instancePath + "/seed", schemaPath: "#/properties/seed/maxLength", keyword: "maxLength", params: { limit: 1024 }, message: "must NOT have more than 1024 characters" }];
                    return false;
                  }
                } else {
                  validate102.errors = [{ instancePath: instancePath + "/seed", schemaPath: "#/properties/seed/type", keyword: "type", params: { type: "string" }, message: "must be string" }];
                  return false;
                }
              }
              var valid1 = _errs3 === errors;
            } else {
              var valid1 = true;
            }
            if (valid1) {
              if (data.size !== void 0) {
                let data1 = data.size;
                const _errs5 = errors;
                if (!(typeof data1 == "number" && (!(data1 % 1) && !isNaN(data1)) && isFinite(data1))) {
                  validate102.errors = [{ instancePath: instancePath + "/size", schemaPath: "#/properties/size/type", keyword: "type", params: { type: "integer" }, message: "must be integer" }];
                  return false;
                }
                if (errors === _errs5) {
                  if (typeof data1 == "number" && isFinite(data1)) {
                    if (data1 > 4096 || isNaN(data1)) {
                      validate102.errors = [{ instancePath: instancePath + "/size", schemaPath: "#/properties/size/maximum", keyword: "maximum", params: { comparison: "<=", limit: 4096 }, message: "must be <= 4096" }];
                      return false;
                    } else {
                      if (data1 < 1 || isNaN(data1)) {
                        validate102.errors = [{ instancePath: instancePath + "/size", schemaPath: "#/properties/size/minimum", keyword: "minimum", params: { comparison: ">=", limit: 1 }, message: "must be >= 1" }];
                        return false;
                      }
                    }
                  }
                }
                var valid1 = _errs5 === errors;
              } else {
                var valid1 = true;
              }
              if (valid1) {
                if (data.idRandomization !== void 0) {
                  const _errs7 = errors;
                  if (typeof data.idRandomization !== "boolean") {
                    validate102.errors = [{ instancePath: instancePath + "/idRandomization", schemaPath: "#/properties/idRandomization/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" }];
                    return false;
                  }
                  var valid1 = _errs7 === errors;
                } else {
                  var valid1 = true;
                }
                if (valid1) {
                  if (data.title !== void 0) {
                    let data3 = data.title;
                    const _errs9 = errors;
                    if (errors === _errs9) {
                      if (typeof data3 === "string") {
                        if (func22(data3) > 256) {
                          validate102.errors = [{ instancePath: instancePath + "/title", schemaPath: "#/properties/title/maxLength", keyword: "maxLength", params: { limit: 256 }, message: "must NOT have more than 256 characters" }];
                          return false;
                        }
                      } else {
                        validate102.errors = [{ instancePath: instancePath + "/title", schemaPath: "#/properties/title/type", keyword: "type", params: { type: "string" }, message: "must be string" }];
                        return false;
                      }
                    }
                    var valid1 = _errs9 === errors;
                  } else {
                    var valid1 = true;
                  }
                  if (valid1) {
                    if (data.flip !== void 0) {
                      let data4 = data.flip;
                      const _errs11 = errors;
                      const _errs12 = errors;
                      let valid2 = false;
                      const _errs13 = errors;
                      if (typeof data4 !== "string") {
                        const err2 = { instancePath: instancePath + "/flip", schemaPath: "#/definitions/flip/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                        if (vErrors === null) {
                          vErrors = [err2];
                        } else {
                          vErrors.push(err2);
                        }
                        errors++;
                      }
                      if (!(data4 === "none" || data4 === "horizontal" || data4 === "vertical" || data4 === "both")) {
                        const err3 = { instancePath: instancePath + "/flip", schemaPath: "#/definitions/flip/enum", keyword: "enum", params: { allowedValues: schema12.enum }, message: "must be equal to one of the allowed values" };
                        if (vErrors === null) {
                          vErrors = [err3];
                        } else {
                          vErrors.push(err3);
                        }
                        errors++;
                      }
                      var _valid0 = _errs13 === errors;
                      valid2 = valid2 || _valid0;
                      if (!valid2) {
                        const _errs16 = errors;
                        if (errors === _errs16) {
                          if (Array.isArray(data4)) {
                            if (data4.length > 4) {
                              const err4 = { instancePath: instancePath + "/flip", schemaPath: "#/properties/flip/anyOf/1/maxItems", keyword: "maxItems", params: { limit: 4 }, message: "must NOT have more than 4 items" };
                              if (vErrors === null) {
                                vErrors = [err4];
                              } else {
                                vErrors.push(err4);
                              }
                              errors++;
                            } else {
                              if (data4.length < 0) {
                                const err5 = { instancePath: instancePath + "/flip", schemaPath: "#/properties/flip/anyOf/1/minItems", keyword: "minItems", params: { limit: 0 }, message: "must NOT have fewer than 0 items" };
                                if (vErrors === null) {
                                  vErrors = [err5];
                                } else {
                                  vErrors.push(err5);
                                }
                                errors++;
                              } else {
                                var valid4 = true;
                                const len0 = data4.length;
                                for (let i0 = 0; i0 < len0; i0++) {
                                  let data5 = data4[i0];
                                  const _errs18 = errors;
                                  if (typeof data5 !== "string") {
                                    const err6 = { instancePath: instancePath + "/flip/" + i0, schemaPath: "#/definitions/flip/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                    if (vErrors === null) {
                                      vErrors = [err6];
                                    } else {
                                      vErrors.push(err6);
                                    }
                                    errors++;
                                  }
                                  if (!(data5 === "none" || data5 === "horizontal" || data5 === "vertical" || data5 === "both")) {
                                    const err7 = { instancePath: instancePath + "/flip/" + i0, schemaPath: "#/definitions/flip/enum", keyword: "enum", params: { allowedValues: schema12.enum }, message: "must be equal to one of the allowed values" };
                                    if (vErrors === null) {
                                      vErrors = [err7];
                                    } else {
                                      vErrors.push(err7);
                                    }
                                    errors++;
                                  }
                                  var valid4 = _errs18 === errors;
                                  if (!valid4) {
                                    break;
                                  }
                                }
                              }
                            }
                          } else {
                            const err8 = { instancePath: instancePath + "/flip", schemaPath: "#/properties/flip/anyOf/1/type", keyword: "type", params: { type: "array" }, message: "must be array" };
                            if (vErrors === null) {
                              vErrors = [err8];
                            } else {
                              vErrors.push(err8);
                            }
                            errors++;
                          }
                        }
                        var _valid0 = _errs16 === errors;
                        valid2 = valid2 || _valid0;
                      }
                      if (!valid2) {
                        const err9 = { instancePath: instancePath + "/flip", schemaPath: "#/properties/flip/anyOf", keyword: "anyOf", params: {}, message: "must match a schema in anyOf" };
                        if (vErrors === null) {
                          vErrors = [err9];
                        } else {
                          vErrors.push(err9);
                        }
                        errors++;
                        validate102.errors = vErrors;
                        return false;
                      } else {
                        errors = _errs12;
                        if (vErrors !== null) {
                          if (_errs12) {
                            vErrors.length = _errs12;
                          } else {
                            vErrors = null;
                          }
                        }
                      }
                      var valid1 = _errs11 === errors;
                    } else {
                      var valid1 = true;
                    }
                    if (valid1) {
                      if (data.fontFamily !== void 0) {
                        let data6 = data.fontFamily;
                        const _errs21 = errors;
                        const _errs22 = errors;
                        let valid6 = false;
                        const _errs23 = errors;
                        const _errs24 = errors;
                        if (errors === _errs24) {
                          if (typeof data6 === "string") {
                            if (func22(data6) > 256) {
                              const err10 = { instancePath: instancePath + "/fontFamily", schemaPath: "#/definitions/fontFamilyName/maxLength", keyword: "maxLength", params: { limit: 256 }, message: "must NOT have more than 256 characters" };
                              if (vErrors === null) {
                                vErrors = [err10];
                              } else {
                                vErrors.push(err10);
                              }
                              errors++;
                            } else {
                              if (!pattern92.test(data6)) {
                                const err11 = { instancePath: instancePath + "/fontFamily", schemaPath: "#/definitions/fontFamilyName/pattern", keyword: "pattern", params: { pattern: "^[a-zA-Z0-9_\\-]+( [a-zA-Z0-9_\\-]+)*(, ?[a-zA-Z0-9_\\-]+( [a-zA-Z0-9_\\-]+)*)*$" }, message: 'must match pattern "^[a-zA-Z0-9_\\-]+( [a-zA-Z0-9_\\-]+)*(, ?[a-zA-Z0-9_\\-]+( [a-zA-Z0-9_\\-]+)*)*$"' };
                                if (vErrors === null) {
                                  vErrors = [err11];
                                } else {
                                  vErrors.push(err11);
                                }
                                errors++;
                              }
                            }
                          } else {
                            const err12 = { instancePath: instancePath + "/fontFamily", schemaPath: "#/definitions/fontFamilyName/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                            if (vErrors === null) {
                              vErrors = [err12];
                            } else {
                              vErrors.push(err12);
                            }
                            errors++;
                          }
                        }
                        var _valid1 = _errs23 === errors;
                        valid6 = valid6 || _valid1;
                        if (!valid6) {
                          const _errs26 = errors;
                          if (errors === _errs26) {
                            if (Array.isArray(data6)) {
                              if (data6.length > 128) {
                                const err13 = { instancePath: instancePath + "/fontFamily", schemaPath: "#/properties/fontFamily/anyOf/1/maxItems", keyword: "maxItems", params: { limit: 128 }, message: "must NOT have more than 128 items" };
                                if (vErrors === null) {
                                  vErrors = [err13];
                                } else {
                                  vErrors.push(err13);
                                }
                                errors++;
                              } else {
                                if (data6.length < 0) {
                                  const err14 = { instancePath: instancePath + "/fontFamily", schemaPath: "#/properties/fontFamily/anyOf/1/minItems", keyword: "minItems", params: { limit: 0 }, message: "must NOT have fewer than 0 items" };
                                  if (vErrors === null) {
                                    vErrors = [err14];
                                  } else {
                                    vErrors.push(err14);
                                  }
                                  errors++;
                                } else {
                                  var valid8 = true;
                                  const len1 = data6.length;
                                  for (let i1 = 0; i1 < len1; i1++) {
                                    let data7 = data6[i1];
                                    const _errs28 = errors;
                                    const _errs29 = errors;
                                    if (errors === _errs29) {
                                      if (typeof data7 === "string") {
                                        if (func22(data7) > 256) {
                                          const err15 = { instancePath: instancePath + "/fontFamily/" + i1, schemaPath: "#/definitions/fontFamilyName/maxLength", keyword: "maxLength", params: { limit: 256 }, message: "must NOT have more than 256 characters" };
                                          if (vErrors === null) {
                                            vErrors = [err15];
                                          } else {
                                            vErrors.push(err15);
                                          }
                                          errors++;
                                        } else {
                                          if (!pattern92.test(data7)) {
                                            const err16 = { instancePath: instancePath + "/fontFamily/" + i1, schemaPath: "#/definitions/fontFamilyName/pattern", keyword: "pattern", params: { pattern: "^[a-zA-Z0-9_\\-]+( [a-zA-Z0-9_\\-]+)*(, ?[a-zA-Z0-9_\\-]+( [a-zA-Z0-9_\\-]+)*)*$" }, message: 'must match pattern "^[a-zA-Z0-9_\\-]+( [a-zA-Z0-9_\\-]+)*(, ?[a-zA-Z0-9_\\-]+( [a-zA-Z0-9_\\-]+)*)*$"' };
                                            if (vErrors === null) {
                                              vErrors = [err16];
                                            } else {
                                              vErrors.push(err16);
                                            }
                                            errors++;
                                          }
                                        }
                                      } else {
                                        const err17 = { instancePath: instancePath + "/fontFamily/" + i1, schemaPath: "#/definitions/fontFamilyName/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                        if (vErrors === null) {
                                          vErrors = [err17];
                                        } else {
                                          vErrors.push(err17);
                                        }
                                        errors++;
                                      }
                                    }
                                    var valid8 = _errs28 === errors;
                                    if (!valid8) {
                                      break;
                                    }
                                  }
                                }
                              }
                            } else {
                              const err18 = { instancePath: instancePath + "/fontFamily", schemaPath: "#/properties/fontFamily/anyOf/1/type", keyword: "type", params: { type: "array" }, message: "must be array" };
                              if (vErrors === null) {
                                vErrors = [err18];
                              } else {
                                vErrors.push(err18);
                              }
                              errors++;
                            }
                          }
                          var _valid1 = _errs26 === errors;
                          valid6 = valid6 || _valid1;
                        }
                        if (!valid6) {
                          const err19 = { instancePath: instancePath + "/fontFamily", schemaPath: "#/properties/fontFamily/anyOf", keyword: "anyOf", params: {}, message: "must match a schema in anyOf" };
                          if (vErrors === null) {
                            vErrors = [err19];
                          } else {
                            vErrors.push(err19);
                          }
                          errors++;
                          validate102.errors = vErrors;
                          return false;
                        } else {
                          errors = _errs22;
                          if (vErrors !== null) {
                            if (_errs22) {
                              vErrors.length = _errs22;
                            } else {
                              vErrors = null;
                            }
                          }
                        }
                        var valid1 = _errs21 === errors;
                      } else {
                        var valid1 = true;
                      }
                      if (valid1) {
                        if (data.fontWeight !== void 0) {
                          let data8 = data.fontWeight;
                          const _errs31 = errors;
                          const _errs32 = errors;
                          let valid10 = false;
                          const _errs33 = errors;
                          const _errs34 = errors;
                          if (!(typeof data8 == "number" && (!(data8 % 1) && !isNaN(data8)) && isFinite(data8))) {
                            const err20 = { instancePath: instancePath + "/fontWeight", schemaPath: "#/definitions/fontWeight/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
                            if (vErrors === null) {
                              vErrors = [err20];
                            } else {
                              vErrors.push(err20);
                            }
                            errors++;
                          }
                          if (errors === _errs34) {
                            if (typeof data8 == "number" && isFinite(data8)) {
                              if (data8 > 1e3 || isNaN(data8)) {
                                const err21 = { instancePath: instancePath + "/fontWeight", schemaPath: "#/definitions/fontWeight/maximum", keyword: "maximum", params: { comparison: "<=", limit: 1e3 }, message: "must be <= 1000" };
                                if (vErrors === null) {
                                  vErrors = [err21];
                                } else {
                                  vErrors.push(err21);
                                }
                                errors++;
                              } else {
                                if (data8 < 1 || isNaN(data8)) {
                                  const err22 = { instancePath: instancePath + "/fontWeight", schemaPath: "#/definitions/fontWeight/minimum", keyword: "minimum", params: { comparison: ">=", limit: 1 }, message: "must be >= 1" };
                                  if (vErrors === null) {
                                    vErrors = [err22];
                                  } else {
                                    vErrors.push(err22);
                                  }
                                  errors++;
                                }
                              }
                            }
                          }
                          var _valid2 = _errs33 === errors;
                          valid10 = valid10 || _valid2;
                          if (!valid10) {
                            const _errs36 = errors;
                            if (errors === _errs36) {
                              if (Array.isArray(data8)) {
                                if (data8.length > 128) {
                                  const err23 = { instancePath: instancePath + "/fontWeight", schemaPath: "#/properties/fontWeight/anyOf/1/maxItems", keyword: "maxItems", params: { limit: 128 }, message: "must NOT have more than 128 items" };
                                  if (vErrors === null) {
                                    vErrors = [err23];
                                  } else {
                                    vErrors.push(err23);
                                  }
                                  errors++;
                                } else {
                                  if (data8.length < 0) {
                                    const err24 = { instancePath: instancePath + "/fontWeight", schemaPath: "#/properties/fontWeight/anyOf/1/minItems", keyword: "minItems", params: { limit: 0 }, message: "must NOT have fewer than 0 items" };
                                    if (vErrors === null) {
                                      vErrors = [err24];
                                    } else {
                                      vErrors.push(err24);
                                    }
                                    errors++;
                                  } else {
                                    var valid12 = true;
                                    const len2 = data8.length;
                                    for (let i2 = 0; i2 < len2; i2++) {
                                      let data9 = data8[i2];
                                      const _errs38 = errors;
                                      const _errs39 = errors;
                                      if (!(typeof data9 == "number" && (!(data9 % 1) && !isNaN(data9)) && isFinite(data9))) {
                                        const err25 = { instancePath: instancePath + "/fontWeight/" + i2, schemaPath: "#/definitions/fontWeight/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
                                        if (vErrors === null) {
                                          vErrors = [err25];
                                        } else {
                                          vErrors.push(err25);
                                        }
                                        errors++;
                                      }
                                      if (errors === _errs39) {
                                        if (typeof data9 == "number" && isFinite(data9)) {
                                          if (data9 > 1e3 || isNaN(data9)) {
                                            const err26 = { instancePath: instancePath + "/fontWeight/" + i2, schemaPath: "#/definitions/fontWeight/maximum", keyword: "maximum", params: { comparison: "<=", limit: 1e3 }, message: "must be <= 1000" };
                                            if (vErrors === null) {
                                              vErrors = [err26];
                                            } else {
                                              vErrors.push(err26);
                                            }
                                            errors++;
                                          } else {
                                            if (data9 < 1 || isNaN(data9)) {
                                              const err27 = { instancePath: instancePath + "/fontWeight/" + i2, schemaPath: "#/definitions/fontWeight/minimum", keyword: "minimum", params: { comparison: ">=", limit: 1 }, message: "must be >= 1" };
                                              if (vErrors === null) {
                                                vErrors = [err27];
                                              } else {
                                                vErrors.push(err27);
                                              }
                                              errors++;
                                            }
                                          }
                                        }
                                      }
                                      var valid12 = _errs38 === errors;
                                      if (!valid12) {
                                        break;
                                      }
                                    }
                                  }
                                }
                              } else {
                                const err28 = { instancePath: instancePath + "/fontWeight", schemaPath: "#/properties/fontWeight/anyOf/1/type", keyword: "type", params: { type: "array" }, message: "must be array" };
                                if (vErrors === null) {
                                  vErrors = [err28];
                                } else {
                                  vErrors.push(err28);
                                }
                                errors++;
                              }
                            }
                            var _valid2 = _errs36 === errors;
                            valid10 = valid10 || _valid2;
                          }
                          if (!valid10) {
                            const err29 = { instancePath: instancePath + "/fontWeight", schemaPath: "#/properties/fontWeight/anyOf", keyword: "anyOf", params: {}, message: "must match a schema in anyOf" };
                            if (vErrors === null) {
                              vErrors = [err29];
                            } else {
                              vErrors.push(err29);
                            }
                            errors++;
                            validate102.errors = vErrors;
                            return false;
                          } else {
                            errors = _errs32;
                            if (vErrors !== null) {
                              if (_errs32) {
                                vErrors.length = _errs32;
                              } else {
                                vErrors = null;
                              }
                            }
                          }
                          var valid1 = _errs31 === errors;
                        } else {
                          var valid1 = true;
                        }
                        if (valid1) {
                          if (data.scale !== void 0) {
                            const _errs41 = errors;
                            if (!validate112(data.scale, { instancePath: instancePath + "/scale", parentData: data, parentDataProperty: "scale", rootData })) {
                              vErrors = vErrors === null ? validate112.errors : vErrors.concat(validate112.errors);
                              errors = vErrors.length;
                            }
                            var valid1 = _errs41 === errors;
                          } else {
                            var valid1 = true;
                          }
                          if (valid1) {
                            if (data.borderRadius !== void 0) {
                              let data11 = data.borderRadius;
                              const _errs43 = errors;
                              const _errs44 = errors;
                              let valid15 = false;
                              const _errs45 = errors;
                              const _errs46 = errors;
                              if (errors === _errs46) {
                                if (typeof data11 == "number" && isFinite(data11)) {
                                  if (data11 > 50 || isNaN(data11)) {
                                    const err30 = { instancePath: instancePath + "/borderRadius", schemaPath: "#/definitions/borderRadius/maximum", keyword: "maximum", params: { comparison: "<=", limit: 50 }, message: "must be <= 50" };
                                    if (vErrors === null) {
                                      vErrors = [err30];
                                    } else {
                                      vErrors.push(err30);
                                    }
                                    errors++;
                                  } else {
                                    if (data11 < 0 || isNaN(data11)) {
                                      const err31 = { instancePath: instancePath + "/borderRadius", schemaPath: "#/definitions/borderRadius/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
                                      if (vErrors === null) {
                                        vErrors = [err31];
                                      } else {
                                        vErrors.push(err31);
                                      }
                                      errors++;
                                    }
                                  }
                                } else {
                                  const err32 = { instancePath: instancePath + "/borderRadius", schemaPath: "#/definitions/borderRadius/type", keyword: "type", params: { type: "number" }, message: "must be number" };
                                  if (vErrors === null) {
                                    vErrors = [err32];
                                  } else {
                                    vErrors.push(err32);
                                  }
                                  errors++;
                                }
                              }
                              var _valid3 = _errs45 === errors;
                              valid15 = valid15 || _valid3;
                              if (!valid15) {
                                const _errs48 = errors;
                                if (errors === _errs48) {
                                  if (Array.isArray(data11)) {
                                    if (data11.length > 2) {
                                      const err33 = { instancePath: instancePath + "/borderRadius", schemaPath: "#/properties/borderRadius/anyOf/1/maxItems", keyword: "maxItems", params: { limit: 2 }, message: "must NOT have more than 2 items" };
                                      if (vErrors === null) {
                                        vErrors = [err33];
                                      } else {
                                        vErrors.push(err33);
                                      }
                                      errors++;
                                    } else {
                                      if (data11.length < 0) {
                                        const err34 = { instancePath: instancePath + "/borderRadius", schemaPath: "#/properties/borderRadius/anyOf/1/minItems", keyword: "minItems", params: { limit: 0 }, message: "must NOT have fewer than 0 items" };
                                        if (vErrors === null) {
                                          vErrors = [err34];
                                        } else {
                                          vErrors.push(err34);
                                        }
                                        errors++;
                                      } else {
                                        var valid17 = true;
                                        const len3 = data11.length;
                                        for (let i3 = 0; i3 < len3; i3++) {
                                          let data12 = data11[i3];
                                          const _errs50 = errors;
                                          const _errs51 = errors;
                                          if (errors === _errs51) {
                                            if (typeof data12 == "number" && isFinite(data12)) {
                                              if (data12 > 50 || isNaN(data12)) {
                                                const err35 = { instancePath: instancePath + "/borderRadius/" + i3, schemaPath: "#/definitions/borderRadius/maximum", keyword: "maximum", params: { comparison: "<=", limit: 50 }, message: "must be <= 50" };
                                                if (vErrors === null) {
                                                  vErrors = [err35];
                                                } else {
                                                  vErrors.push(err35);
                                                }
                                                errors++;
                                              } else {
                                                if (data12 < 0 || isNaN(data12)) {
                                                  const err36 = { instancePath: instancePath + "/borderRadius/" + i3, schemaPath: "#/definitions/borderRadius/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
                                                  if (vErrors === null) {
                                                    vErrors = [err36];
                                                  } else {
                                                    vErrors.push(err36);
                                                  }
                                                  errors++;
                                                }
                                              }
                                            } else {
                                              const err37 = { instancePath: instancePath + "/borderRadius/" + i3, schemaPath: "#/definitions/borderRadius/type", keyword: "type", params: { type: "number" }, message: "must be number" };
                                              if (vErrors === null) {
                                                vErrors = [err37];
                                              } else {
                                                vErrors.push(err37);
                                              }
                                              errors++;
                                            }
                                          }
                                          var valid17 = _errs50 === errors;
                                          if (!valid17) {
                                            break;
                                          }
                                        }
                                      }
                                    }
                                  } else {
                                    const err38 = { instancePath: instancePath + "/borderRadius", schemaPath: "#/properties/borderRadius/anyOf/1/type", keyword: "type", params: { type: "array" }, message: "must be array" };
                                    if (vErrors === null) {
                                      vErrors = [err38];
                                    } else {
                                      vErrors.push(err38);
                                    }
                                    errors++;
                                  }
                                }
                                var _valid3 = _errs48 === errors;
                                valid15 = valid15 || _valid3;
                              }
                              if (!valid15) {
                                const err39 = { instancePath: instancePath + "/borderRadius", schemaPath: "#/properties/borderRadius/anyOf", keyword: "anyOf", params: {}, message: "must match a schema in anyOf" };
                                if (vErrors === null) {
                                  vErrors = [err39];
                                } else {
                                  vErrors.push(err39);
                                }
                                errors++;
                                validate102.errors = vErrors;
                                return false;
                              } else {
                                errors = _errs44;
                                if (vErrors !== null) {
                                  if (_errs44) {
                                    vErrors.length = _errs44;
                                  } else {
                                    vErrors = null;
                                  }
                                }
                              }
                              var valid1 = _errs43 === errors;
                            } else {
                              var valid1 = true;
                            }
                            if (valid1) {
                              if (data.tags !== void 0) {
                                let data13 = data.tags;
                                const _errs53 = errors;
                                const _errs54 = errors;
                                let valid19 = false;
                                const _errs55 = errors;
                                const _errs56 = errors;
                                if (errors === _errs56) {
                                  if (typeof data13 === "string") {
                                    if (func22(data13) > 130) {
                                      const err40 = { instancePath: instancePath + "/tags", schemaPath: "#/definitions/tagFilter/maxLength", keyword: "maxLength", params: { limit: 130 }, message: "must NOT have more than 130 characters" };
                                      if (vErrors === null) {
                                        vErrors = [err40];
                                      } else {
                                        vErrors.push(err40);
                                      }
                                      errors++;
                                    } else {
                                      if (!pattern11.test(data13)) {
                                        const err41 = { instancePath: instancePath + "/tags", schemaPath: "#/definitions/tagFilter/pattern", keyword: "pattern", params: { pattern: "^!?[a-z][a-zA-Z0-9]*(:[a-z][a-zA-Z0-9]*)?$" }, message: 'must match pattern "^!?[a-z][a-zA-Z0-9]*(:[a-z][a-zA-Z0-9]*)?$"' };
                                        if (vErrors === null) {
                                          vErrors = [err41];
                                        } else {
                                          vErrors.push(err41);
                                        }
                                        errors++;
                                      }
                                    }
                                  } else {
                                    const err42 = { instancePath: instancePath + "/tags", schemaPath: "#/definitions/tagFilter/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                    if (vErrors === null) {
                                      vErrors = [err42];
                                    } else {
                                      vErrors.push(err42);
                                    }
                                    errors++;
                                  }
                                }
                                var _valid4 = _errs55 === errors;
                                valid19 = valid19 || _valid4;
                                if (!valid19) {
                                  const _errs58 = errors;
                                  if (errors === _errs58) {
                                    if (Array.isArray(data13)) {
                                      if (data13.length > 128) {
                                        const err43 = { instancePath: instancePath + "/tags", schemaPath: "#/properties/tags/anyOf/1/maxItems", keyword: "maxItems", params: { limit: 128 }, message: "must NOT have more than 128 items" };
                                        if (vErrors === null) {
                                          vErrors = [err43];
                                        } else {
                                          vErrors.push(err43);
                                        }
                                        errors++;
                                      } else {
                                        if (data13.length < 0) {
                                          const err44 = { instancePath: instancePath + "/tags", schemaPath: "#/properties/tags/anyOf/1/minItems", keyword: "minItems", params: { limit: 0 }, message: "must NOT have fewer than 0 items" };
                                          if (vErrors === null) {
                                            vErrors = [err44];
                                          } else {
                                            vErrors.push(err44);
                                          }
                                          errors++;
                                        } else {
                                          var valid21 = true;
                                          const len4 = data13.length;
                                          for (let i4 = 0; i4 < len4; i4++) {
                                            let data14 = data13[i4];
                                            const _errs60 = errors;
                                            const _errs61 = errors;
                                            if (errors === _errs61) {
                                              if (typeof data14 === "string") {
                                                if (func22(data14) > 130) {
                                                  const err45 = { instancePath: instancePath + "/tags/" + i4, schemaPath: "#/definitions/tagFilter/maxLength", keyword: "maxLength", params: { limit: 130 }, message: "must NOT have more than 130 characters" };
                                                  if (vErrors === null) {
                                                    vErrors = [err45];
                                                  } else {
                                                    vErrors.push(err45);
                                                  }
                                                  errors++;
                                                } else {
                                                  if (!pattern11.test(data14)) {
                                                    const err46 = { instancePath: instancePath + "/tags/" + i4, schemaPath: "#/definitions/tagFilter/pattern", keyword: "pattern", params: { pattern: "^!?[a-z][a-zA-Z0-9]*(:[a-z][a-zA-Z0-9]*)?$" }, message: 'must match pattern "^!?[a-z][a-zA-Z0-9]*(:[a-z][a-zA-Z0-9]*)?$"' };
                                                    if (vErrors === null) {
                                                      vErrors = [err46];
                                                    } else {
                                                      vErrors.push(err46);
                                                    }
                                                    errors++;
                                                  }
                                                }
                                              } else {
                                                const err47 = { instancePath: instancePath + "/tags/" + i4, schemaPath: "#/definitions/tagFilter/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                                if (vErrors === null) {
                                                  vErrors = [err47];
                                                } else {
                                                  vErrors.push(err47);
                                                }
                                                errors++;
                                              }
                                            }
                                            var valid21 = _errs60 === errors;
                                            if (!valid21) {
                                              break;
                                            }
                                          }
                                        }
                                      }
                                    } else {
                                      const err48 = { instancePath: instancePath + "/tags", schemaPath: "#/properties/tags/anyOf/1/type", keyword: "type", params: { type: "array" }, message: "must be array" };
                                      if (vErrors === null) {
                                        vErrors = [err48];
                                      } else {
                                        vErrors.push(err48);
                                      }
                                      errors++;
                                    }
                                  }
                                  var _valid4 = _errs58 === errors;
                                  valid19 = valid19 || _valid4;
                                }
                                if (!valid19) {
                                  const err49 = { instancePath: instancePath + "/tags", schemaPath: "#/properties/tags/anyOf", keyword: "anyOf", params: {}, message: "must match a schema in anyOf" };
                                  if (vErrors === null) {
                                    vErrors = [err49];
                                  } else {
                                    vErrors.push(err49);
                                  }
                                  errors++;
                                  validate102.errors = vErrors;
                                  return false;
                                } else {
                                  errors = _errs54;
                                  if (vErrors !== null) {
                                    if (_errs54) {
                                      vErrors.length = _errs54;
                                    } else {
                                      vErrors = null;
                                    }
                                  }
                                }
                                var valid1 = _errs53 === errors;
                              } else {
                                var valid1 = true;
                              }
                              if (valid1) {
                                var valid23 = true;
                                for (const key2 in data) {
                                  if (pattern02.test(key2)) {
                                    let data15 = data[key2];
                                    const _errs63 = errors;
                                    if (errors === _errs63) {
                                      if (typeof data15 == "number" && isFinite(data15)) {
                                        if (data15 > 100 || isNaN(data15)) {
                                          validate102.errors = [{ instancePath: instancePath + "/" + key2.replace(/~/g, "~0").replace(/\//g, "~1"), schemaPath: "#/patternProperties/%5E%5Ba-z%5D%5Ba-zA-Z0-9%5D*Probability%24/maximum", keyword: "maximum", params: { comparison: "<=", limit: 100 }, message: "must be <= 100" }];
                                          return false;
                                        } else {
                                          if (data15 < 0 || isNaN(data15)) {
                                            validate102.errors = [{ instancePath: instancePath + "/" + key2.replace(/~/g, "~0").replace(/\//g, "~1"), schemaPath: "#/patternProperties/%5E%5Ba-z%5D%5Ba-zA-Z0-9%5D*Probability%24/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" }];
                                            return false;
                                          }
                                        }
                                      } else {
                                        validate102.errors = [{ instancePath: instancePath + "/" + key2.replace(/~/g, "~0").replace(/\//g, "~1"), schemaPath: "#/patternProperties/%5E%5Ba-z%5D%5Ba-zA-Z0-9%5D*Probability%24/type", keyword: "type", params: { type: "number" }, message: "must be number" }];
                                        return false;
                                      }
                                    }
                                    var valid23 = _errs63 === errors;
                                    if (!valid23) {
                                      break;
                                    }
                                  }
                                }
                                if (valid23) {
                                  var valid23 = true;
                                  for (const key3 in data) {
                                    if (pattern1.test(key3)) {
                                      let data16 = data[key3];
                                      const _errs65 = errors;
                                      const _errs66 = errors;
                                      let valid24 = false;
                                      const _errs67 = errors;
                                      const _errs68 = errors;
                                      if (errors === _errs68) {
                                        if (typeof data16 === "string") {
                                          if (func22(data16) > 64) {
                                            const err50 = { instancePath: instancePath + "/" + key3.replace(/~/g, "~0").replace(/\//g, "~1"), schemaPath: "#/definitions/variantName/maxLength", keyword: "maxLength", params: { limit: 64 }, message: "must NOT have more than 64 characters" };
                                            if (vErrors === null) {
                                              vErrors = [err50];
                                            } else {
                                              vErrors.push(err50);
                                            }
                                            errors++;
                                          } else {
                                            if (!pattern15.test(data16)) {
                                              const err51 = { instancePath: instancePath + "/" + key3.replace(/~/g, "~0").replace(/\//g, "~1"), schemaPath: "#/definitions/variantName/pattern", keyword: "pattern", params: { pattern: "^[a-z][a-zA-Z0-9]*$" }, message: 'must match pattern "^[a-z][a-zA-Z0-9]*$"' };
                                              if (vErrors === null) {
                                                vErrors = [err51];
                                              } else {
                                                vErrors.push(err51);
                                              }
                                              errors++;
                                            }
                                          }
                                        } else {
                                          const err52 = { instancePath: instancePath + "/" + key3.replace(/~/g, "~0").replace(/\//g, "~1"), schemaPath: "#/definitions/variantName/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                          if (vErrors === null) {
                                            vErrors = [err52];
                                          } else {
                                            vErrors.push(err52);
                                          }
                                          errors++;
                                        }
                                      }
                                      var _valid5 = _errs67 === errors;
                                      valid24 = valid24 || _valid5;
                                      if (!valid24) {
                                        const _errs70 = errors;
                                        if (errors === _errs70) {
                                          if (Array.isArray(data16)) {
                                            if (data16.length > 128) {
                                              const err53 = { instancePath: instancePath + "/" + key3.replace(/~/g, "~0").replace(/\//g, "~1"), schemaPath: "#/patternProperties/%5E%5Ba-z%5D%5Ba-zA-Z0-9%5D*Variant%24/anyOf/1/maxItems", keyword: "maxItems", params: { limit: 128 }, message: "must NOT have more than 128 items" };
                                              if (vErrors === null) {
                                                vErrors = [err53];
                                              } else {
                                                vErrors.push(err53);
                                              }
                                              errors++;
                                            } else {
                                              if (data16.length < 0) {
                                                const err54 = { instancePath: instancePath + "/" + key3.replace(/~/g, "~0").replace(/\//g, "~1"), schemaPath: "#/patternProperties/%5E%5Ba-z%5D%5Ba-zA-Z0-9%5D*Variant%24/anyOf/1/minItems", keyword: "minItems", params: { limit: 0 }, message: "must NOT have fewer than 0 items" };
                                                if (vErrors === null) {
                                                  vErrors = [err54];
                                                } else {
                                                  vErrors.push(err54);
                                                }
                                                errors++;
                                              } else {
                                                var valid26 = true;
                                                const len5 = data16.length;
                                                for (let i5 = 0; i5 < len5; i5++) {
                                                  let data17 = data16[i5];
                                                  const _errs72 = errors;
                                                  const _errs73 = errors;
                                                  if (errors === _errs73) {
                                                    if (typeof data17 === "string") {
                                                      if (func22(data17) > 64) {
                                                        const err55 = { instancePath: instancePath + "/" + key3.replace(/~/g, "~0").replace(/\//g, "~1") + "/" + i5, schemaPath: "#/definitions/variantName/maxLength", keyword: "maxLength", params: { limit: 64 }, message: "must NOT have more than 64 characters" };
                                                        if (vErrors === null) {
                                                          vErrors = [err55];
                                                        } else {
                                                          vErrors.push(err55);
                                                        }
                                                        errors++;
                                                      } else {
                                                        if (!pattern15.test(data17)) {
                                                          const err56 = { instancePath: instancePath + "/" + key3.replace(/~/g, "~0").replace(/\//g, "~1") + "/" + i5, schemaPath: "#/definitions/variantName/pattern", keyword: "pattern", params: { pattern: "^[a-z][a-zA-Z0-9]*$" }, message: 'must match pattern "^[a-z][a-zA-Z0-9]*$"' };
                                                          if (vErrors === null) {
                                                            vErrors = [err56];
                                                          } else {
                                                            vErrors.push(err56);
                                                          }
                                                          errors++;
                                                        }
                                                      }
                                                    } else {
                                                      const err57 = { instancePath: instancePath + "/" + key3.replace(/~/g, "~0").replace(/\//g, "~1") + "/" + i5, schemaPath: "#/definitions/variantName/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                                      if (vErrors === null) {
                                                        vErrors = [err57];
                                                      } else {
                                                        vErrors.push(err57);
                                                      }
                                                      errors++;
                                                    }
                                                  }
                                                  var valid26 = _errs72 === errors;
                                                  if (!valid26) {
                                                    break;
                                                  }
                                                }
                                              }
                                            }
                                          } else {
                                            const err58 = { instancePath: instancePath + "/" + key3.replace(/~/g, "~0").replace(/\//g, "~1"), schemaPath: "#/patternProperties/%5E%5Ba-z%5D%5Ba-zA-Z0-9%5D*Variant%24/anyOf/1/type", keyword: "type", params: { type: "array" }, message: "must be array" };
                                            if (vErrors === null) {
                                              vErrors = [err58];
                                            } else {
                                              vErrors.push(err58);
                                            }
                                            errors++;
                                          }
                                        }
                                        var _valid5 = _errs70 === errors;
                                        valid24 = valid24 || _valid5;
                                        if (!valid24) {
                                          const _errs75 = errors;
                                          if (errors === _errs75) {
                                            if (data16 && typeof data16 == "object" && !Array.isArray(data16)) {
                                              if (Object.keys(data16).length > 512) {
                                                const err59 = { instancePath: instancePath + "/" + key3.replace(/~/g, "~0").replace(/\//g, "~1"), schemaPath: "#/patternProperties/%5E%5Ba-z%5D%5Ba-zA-Z0-9%5D*Variant%24/anyOf/2/maxProperties", keyword: "maxProperties", params: { limit: 512 }, message: "must NOT have more than 512 properties" };
                                                if (vErrors === null) {
                                                  vErrors = [err59];
                                                } else {
                                                  vErrors.push(err59);
                                                }
                                                errors++;
                                              } else {
                                                if (Object.keys(data16).length < 1) {
                                                  const err60 = { instancePath: instancePath + "/" + key3.replace(/~/g, "~0").replace(/\//g, "~1"), schemaPath: "#/patternProperties/%5E%5Ba-z%5D%5Ba-zA-Z0-9%5D*Variant%24/anyOf/2/minProperties", keyword: "minProperties", params: { limit: 1 }, message: "must NOT have fewer than 1 properties" };
                                                  if (vErrors === null) {
                                                    vErrors = [err60];
                                                  } else {
                                                    vErrors.push(err60);
                                                  }
                                                  errors++;
                                                } else {
                                                  for (const key4 in data16) {
                                                    const _errs77 = errors;
                                                    const _errs78 = errors;
                                                    if (errors === _errs78) {
                                                      if (typeof key4 === "string") {
                                                        if (func22(key4) > 64) {
                                                          const err61 = { instancePath: instancePath + "/" + key3.replace(/~/g, "~0").replace(/\//g, "~1"), schemaPath: "#/definitions/variantName/maxLength", keyword: "maxLength", params: { limit: 64 }, message: "must NOT have more than 64 characters", propertyName: key4 };
                                                          if (vErrors === null) {
                                                            vErrors = [err61];
                                                          } else {
                                                            vErrors.push(err61);
                                                          }
                                                          errors++;
                                                        } else {
                                                          if (!pattern15.test(key4)) {
                                                            const err62 = { instancePath: instancePath + "/" + key3.replace(/~/g, "~0").replace(/\//g, "~1"), schemaPath: "#/definitions/variantName/pattern", keyword: "pattern", params: { pattern: "^[a-z][a-zA-Z0-9]*$" }, message: 'must match pattern "^[a-z][a-zA-Z0-9]*$"', propertyName: key4 };
                                                            if (vErrors === null) {
                                                              vErrors = [err62];
                                                            } else {
                                                              vErrors.push(err62);
                                                            }
                                                            errors++;
                                                          }
                                                        }
                                                      } else {
                                                        const err63 = { instancePath: instancePath + "/" + key3.replace(/~/g, "~0").replace(/\//g, "~1"), schemaPath: "#/definitions/variantName/type", keyword: "type", params: { type: "string" }, message: "must be string", propertyName: key4 };
                                                        if (vErrors === null) {
                                                          vErrors = [err63];
                                                        } else {
                                                          vErrors.push(err63);
                                                        }
                                                        errors++;
                                                      }
                                                    }
                                                    var valid28 = _errs77 === errors;
                                                    if (!valid28) {
                                                      const err64 = { instancePath: instancePath + "/" + key3.replace(/~/g, "~0").replace(/\//g, "~1"), schemaPath: "#/patternProperties/%5E%5Ba-z%5D%5Ba-zA-Z0-9%5D*Variant%24/anyOf/2/propertyNames", keyword: "propertyNames", params: { propertyName: key4 }, message: "property name must be valid" };
                                                      if (vErrors === null) {
                                                        vErrors = [err64];
                                                      } else {
                                                        vErrors.push(err64);
                                                      }
                                                      errors++;
                                                      break;
                                                    }
                                                  }
                                                  if (valid28) {
                                                    for (const key5 in data16) {
                                                      let data18 = data16[key5];
                                                      const _errs81 = errors;
                                                      if (errors === _errs81) {
                                                        if (typeof data18 == "number" && isFinite(data18)) {
                                                          if (data18 < 0 || isNaN(data18)) {
                                                            const err65 = { instancePath: instancePath + "/" + key3.replace(/~/g, "~0").replace(/\//g, "~1") + "/" + key5.replace(/~/g, "~0").replace(/\//g, "~1"), schemaPath: "#/patternProperties/%5E%5Ba-z%5D%5Ba-zA-Z0-9%5D*Variant%24/anyOf/2/additionalProperties/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
                                                            if (vErrors === null) {
                                                              vErrors = [err65];
                                                            } else {
                                                              vErrors.push(err65);
                                                            }
                                                            errors++;
                                                          }
                                                        } else {
                                                          const err66 = { instancePath: instancePath + "/" + key3.replace(/~/g, "~0").replace(/\//g, "~1") + "/" + key5.replace(/~/g, "~0").replace(/\//g, "~1"), schemaPath: "#/patternProperties/%5E%5Ba-z%5D%5Ba-zA-Z0-9%5D*Variant%24/anyOf/2/additionalProperties/type", keyword: "type", params: { type: "number" }, message: "must be number" };
                                                          if (vErrors === null) {
                                                            vErrors = [err66];
                                                          } else {
                                                            vErrors.push(err66);
                                                          }
                                                          errors++;
                                                        }
                                                      }
                                                      var valid30 = _errs81 === errors;
                                                      if (!valid30) {
                                                        break;
                                                      }
                                                    }
                                                  }
                                                }
                                              }
                                            } else {
                                              const err67 = { instancePath: instancePath + "/" + key3.replace(/~/g, "~0").replace(/\//g, "~1"), schemaPath: "#/patternProperties/%5E%5Ba-z%5D%5Ba-zA-Z0-9%5D*Variant%24/anyOf/2/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                                              if (vErrors === null) {
                                                vErrors = [err67];
                                              } else {
                                                vErrors.push(err67);
                                              }
                                              errors++;
                                            }
                                          }
                                          var _valid5 = _errs75 === errors;
                                          valid24 = valid24 || _valid5;
                                        }
                                      }
                                      if (!valid24) {
                                        const err68 = { instancePath: instancePath + "/" + key3.replace(/~/g, "~0").replace(/\//g, "~1"), schemaPath: "#/patternProperties/%5E%5Ba-z%5D%5Ba-zA-Z0-9%5D*Variant%24/anyOf", keyword: "anyOf", params: {}, message: "must match a schema in anyOf" };
                                        if (vErrors === null) {
                                          vErrors = [err68];
                                        } else {
                                          vErrors.push(err68);
                                        }
                                        errors++;
                                        validate102.errors = vErrors;
                                        return false;
                                      } else {
                                        errors = _errs66;
                                        if (vErrors !== null) {
                                          if (_errs66) {
                                            vErrors.length = _errs66;
                                          } else {
                                            vErrors = null;
                                          }
                                        }
                                      }
                                      var valid23 = _errs65 === errors;
                                      if (!valid23) {
                                        break;
                                      }
                                    }
                                  }
                                  if (valid23) {
                                    var valid23 = true;
                                    for (const key6 in data) {
                                      if (pattern2.test(key6)) {
                                        let data19 = data[key6];
                                        const _errs83 = errors;
                                        const _errs84 = errors;
                                        let valid31 = false;
                                        const _errs85 = errors;
                                        const _errs86 = errors;
                                        if (errors === _errs86) {
                                          if (typeof data19 === "string") {
                                            if (!pattern192.test(data19)) {
                                              const err69 = { instancePath: instancePath + "/" + key6.replace(/~/g, "~0").replace(/\//g, "~1"), schemaPath: "#/definitions/color/pattern", keyword: "pattern", params: { pattern: "^#?([a-fA-F0-9]{3}|[a-fA-F0-9]{4}|[a-fA-F0-9]{6}|[a-fA-F0-9]{8})$" }, message: 'must match pattern "^#?([a-fA-F0-9]{3}|[a-fA-F0-9]{4}|[a-fA-F0-9]{6}|[a-fA-F0-9]{8})$"' };
                                              if (vErrors === null) {
                                                vErrors = [err69];
                                              } else {
                                                vErrors.push(err69);
                                              }
                                              errors++;
                                            }
                                          } else {
                                            const err70 = { instancePath: instancePath + "/" + key6.replace(/~/g, "~0").replace(/\//g, "~1"), schemaPath: "#/definitions/color/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                            if (vErrors === null) {
                                              vErrors = [err70];
                                            } else {
                                              vErrors.push(err70);
                                            }
                                            errors++;
                                          }
                                        }
                                        var _valid6 = _errs85 === errors;
                                        valid31 = valid31 || _valid6;
                                        if (!valid31) {
                                          const _errs88 = errors;
                                          if (errors === _errs88) {
                                            if (Array.isArray(data19)) {
                                              if (data19.length > 128) {
                                                const err71 = { instancePath: instancePath + "/" + key6.replace(/~/g, "~0").replace(/\//g, "~1"), schemaPath: "#/patternProperties/%5E%5Ba-z%5D%5Ba-zA-Z0-9%5D*Color%24/anyOf/1/maxItems", keyword: "maxItems", params: { limit: 128 }, message: "must NOT have more than 128 items" };
                                                if (vErrors === null) {
                                                  vErrors = [err71];
                                                } else {
                                                  vErrors.push(err71);
                                                }
                                                errors++;
                                              } else {
                                                if (data19.length < 0) {
                                                  const err72 = { instancePath: instancePath + "/" + key6.replace(/~/g, "~0").replace(/\//g, "~1"), schemaPath: "#/patternProperties/%5E%5Ba-z%5D%5Ba-zA-Z0-9%5D*Color%24/anyOf/1/minItems", keyword: "minItems", params: { limit: 0 }, message: "must NOT have fewer than 0 items" };
                                                  if (vErrors === null) {
                                                    vErrors = [err72];
                                                  } else {
                                                    vErrors.push(err72);
                                                  }
                                                  errors++;
                                                } else {
                                                  var valid33 = true;
                                                  const len6 = data19.length;
                                                  for (let i6 = 0; i6 < len6; i6++) {
                                                    let data20 = data19[i6];
                                                    const _errs90 = errors;
                                                    const _errs91 = errors;
                                                    if (errors === _errs91) {
                                                      if (typeof data20 === "string") {
                                                        if (!pattern192.test(data20)) {
                                                          const err73 = { instancePath: instancePath + "/" + key6.replace(/~/g, "~0").replace(/\//g, "~1") + "/" + i6, schemaPath: "#/definitions/color/pattern", keyword: "pattern", params: { pattern: "^#?([a-fA-F0-9]{3}|[a-fA-F0-9]{4}|[a-fA-F0-9]{6}|[a-fA-F0-9]{8})$" }, message: 'must match pattern "^#?([a-fA-F0-9]{3}|[a-fA-F0-9]{4}|[a-fA-F0-9]{6}|[a-fA-F0-9]{8})$"' };
                                                          if (vErrors === null) {
                                                            vErrors = [err73];
                                                          } else {
                                                            vErrors.push(err73);
                                                          }
                                                          errors++;
                                                        }
                                                      } else {
                                                        const err74 = { instancePath: instancePath + "/" + key6.replace(/~/g, "~0").replace(/\//g, "~1") + "/" + i6, schemaPath: "#/definitions/color/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                                        if (vErrors === null) {
                                                          vErrors = [err74];
                                                        } else {
                                                          vErrors.push(err74);
                                                        }
                                                        errors++;
                                                      }
                                                    }
                                                    var valid33 = _errs90 === errors;
                                                    if (!valid33) {
                                                      break;
                                                    }
                                                  }
                                                }
                                              }
                                            } else {
                                              const err75 = { instancePath: instancePath + "/" + key6.replace(/~/g, "~0").replace(/\//g, "~1"), schemaPath: "#/patternProperties/%5E%5Ba-z%5D%5Ba-zA-Z0-9%5D*Color%24/anyOf/1/type", keyword: "type", params: { type: "array" }, message: "must be array" };
                                              if (vErrors === null) {
                                                vErrors = [err75];
                                              } else {
                                                vErrors.push(err75);
                                              }
                                              errors++;
                                            }
                                          }
                                          var _valid6 = _errs88 === errors;
                                          valid31 = valid31 || _valid6;
                                        }
                                        if (!valid31) {
                                          const err76 = { instancePath: instancePath + "/" + key6.replace(/~/g, "~0").replace(/\//g, "~1"), schemaPath: "#/patternProperties/%5E%5Ba-z%5D%5Ba-zA-Z0-9%5D*Color%24/anyOf", keyword: "anyOf", params: {}, message: "must match a schema in anyOf" };
                                          if (vErrors === null) {
                                            vErrors = [err76];
                                          } else {
                                            vErrors.push(err76);
                                          }
                                          errors++;
                                          validate102.errors = vErrors;
                                          return false;
                                        } else {
                                          errors = _errs84;
                                          if (vErrors !== null) {
                                            if (_errs84) {
                                              vErrors.length = _errs84;
                                            } else {
                                              vErrors = null;
                                            }
                                          }
                                        }
                                        var valid23 = _errs83 === errors;
                                        if (!valid23) {
                                          break;
                                        }
                                      }
                                    }
                                    if (valid23) {
                                      var valid23 = true;
                                      for (const key7 in data) {
                                        if (pattern32.test(key7)) {
                                          let data21 = data[key7];
                                          const _errs93 = errors;
                                          const _errs94 = errors;
                                          let valid35 = false;
                                          const _errs95 = errors;
                                          if (typeof data21 !== "string") {
                                            const err77 = { instancePath: instancePath + "/" + key7.replace(/~/g, "~0").replace(/\//g, "~1"), schemaPath: "#/definitions/colorFill/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                            if (vErrors === null) {
                                              vErrors = [err77];
                                            } else {
                                              vErrors.push(err77);
                                            }
                                            errors++;
                                          }
                                          if (!(data21 === "solid" || data21 === "linear" || data21 === "radial")) {
                                            const err78 = { instancePath: instancePath + "/" + key7.replace(/~/g, "~0").replace(/\//g, "~1"), schemaPath: "#/definitions/colorFill/enum", keyword: "enum", params: { allowedValues: schema30.enum }, message: "must be equal to one of the allowed values" };
                                            if (vErrors === null) {
                                              vErrors = [err78];
                                            } else {
                                              vErrors.push(err78);
                                            }
                                            errors++;
                                          }
                                          var _valid7 = _errs95 === errors;
                                          valid35 = valid35 || _valid7;
                                          if (!valid35) {
                                            const _errs98 = errors;
                                            if (errors === _errs98) {
                                              if (Array.isArray(data21)) {
                                                if (data21.length > 128) {
                                                  const err79 = { instancePath: instancePath + "/" + key7.replace(/~/g, "~0").replace(/\//g, "~1"), schemaPath: "#/patternProperties/%5E%5Ba-z%5D%5Ba-zA-Z0-9%5D*ColorFill%24/anyOf/1/maxItems", keyword: "maxItems", params: { limit: 128 }, message: "must NOT have more than 128 items" };
                                                  if (vErrors === null) {
                                                    vErrors = [err79];
                                                  } else {
                                                    vErrors.push(err79);
                                                  }
                                                  errors++;
                                                } else {
                                                  if (data21.length < 0) {
                                                    const err80 = { instancePath: instancePath + "/" + key7.replace(/~/g, "~0").replace(/\//g, "~1"), schemaPath: "#/patternProperties/%5E%5Ba-z%5D%5Ba-zA-Z0-9%5D*ColorFill%24/anyOf/1/minItems", keyword: "minItems", params: { limit: 0 }, message: "must NOT have fewer than 0 items" };
                                                    if (vErrors === null) {
                                                      vErrors = [err80];
                                                    } else {
                                                      vErrors.push(err80);
                                                    }
                                                    errors++;
                                                  } else {
                                                    var valid37 = true;
                                                    const len7 = data21.length;
                                                    for (let i7 = 0; i7 < len7; i7++) {
                                                      let data22 = data21[i7];
                                                      const _errs100 = errors;
                                                      if (typeof data22 !== "string") {
                                                        const err81 = { instancePath: instancePath + "/" + key7.replace(/~/g, "~0").replace(/\//g, "~1") + "/" + i7, schemaPath: "#/definitions/colorFill/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                                        if (vErrors === null) {
                                                          vErrors = [err81];
                                                        } else {
                                                          vErrors.push(err81);
                                                        }
                                                        errors++;
                                                      }
                                                      if (!(data22 === "solid" || data22 === "linear" || data22 === "radial")) {
                                                        const err82 = { instancePath: instancePath + "/" + key7.replace(/~/g, "~0").replace(/\//g, "~1") + "/" + i7, schemaPath: "#/definitions/colorFill/enum", keyword: "enum", params: { allowedValues: schema30.enum }, message: "must be equal to one of the allowed values" };
                                                        if (vErrors === null) {
                                                          vErrors = [err82];
                                                        } else {
                                                          vErrors.push(err82);
                                                        }
                                                        errors++;
                                                      }
                                                      var valid37 = _errs100 === errors;
                                                      if (!valid37) {
                                                        break;
                                                      }
                                                    }
                                                  }
                                                }
                                              } else {
                                                const err83 = { instancePath: instancePath + "/" + key7.replace(/~/g, "~0").replace(/\//g, "~1"), schemaPath: "#/patternProperties/%5E%5Ba-z%5D%5Ba-zA-Z0-9%5D*ColorFill%24/anyOf/1/type", keyword: "type", params: { type: "array" }, message: "must be array" };
                                                if (vErrors === null) {
                                                  vErrors = [err83];
                                                } else {
                                                  vErrors.push(err83);
                                                }
                                                errors++;
                                              }
                                            }
                                            var _valid7 = _errs98 === errors;
                                            valid35 = valid35 || _valid7;
                                          }
                                          if (!valid35) {
                                            const err84 = { instancePath: instancePath + "/" + key7.replace(/~/g, "~0").replace(/\//g, "~1"), schemaPath: "#/patternProperties/%5E%5Ba-z%5D%5Ba-zA-Z0-9%5D*ColorFill%24/anyOf", keyword: "anyOf", params: {}, message: "must match a schema in anyOf" };
                                            if (vErrors === null) {
                                              vErrors = [err84];
                                            } else {
                                              vErrors.push(err84);
                                            }
                                            errors++;
                                            validate102.errors = vErrors;
                                            return false;
                                          } else {
                                            errors = _errs94;
                                            if (vErrors !== null) {
                                              if (_errs94) {
                                                vErrors.length = _errs94;
                                              } else {
                                                vErrors = null;
                                              }
                                            }
                                          }
                                          var valid23 = _errs93 === errors;
                                          if (!valid23) {
                                            break;
                                          }
                                        }
                                      }
                                      if (valid23) {
                                        var valid23 = true;
                                        for (const key8 in data) {
                                          if (pattern42.test(key8)) {
                                            let data23 = data[key8];
                                            const _errs103 = errors;
                                            const _errs104 = errors;
                                            let valid39 = false;
                                            const _errs105 = errors;
                                            const _errs106 = errors;
                                            if (!(typeof data23 == "number" && (!(data23 % 1) && !isNaN(data23)) && isFinite(data23))) {
                                              const err85 = { instancePath: instancePath + "/" + key8.replace(/~/g, "~0").replace(/\//g, "~1"), schemaPath: "#/definitions/colorFillStops/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
                                              if (vErrors === null) {
                                                vErrors = [err85];
                                              } else {
                                                vErrors.push(err85);
                                              }
                                              errors++;
                                            }
                                            if (errors === _errs106) {
                                              if (typeof data23 == "number" && isFinite(data23)) {
                                                if (data23 < 2 || isNaN(data23)) {
                                                  const err86 = { instancePath: instancePath + "/" + key8.replace(/~/g, "~0").replace(/\//g, "~1"), schemaPath: "#/definitions/colorFillStops/minimum", keyword: "minimum", params: { comparison: ">=", limit: 2 }, message: "must be >= 2" };
                                                  if (vErrors === null) {
                                                    vErrors = [err86];
                                                  } else {
                                                    vErrors.push(err86);
                                                  }
                                                  errors++;
                                                }
                                              }
                                            }
                                            var _valid8 = _errs105 === errors;
                                            valid39 = valid39 || _valid8;
                                            if (!valid39) {
                                              const _errs108 = errors;
                                              if (errors === _errs108) {
                                                if (Array.isArray(data23)) {
                                                  if (data23.length > 2) {
                                                    const err87 = { instancePath: instancePath + "/" + key8.replace(/~/g, "~0").replace(/\//g, "~1"), schemaPath: "#/patternProperties/%5E%5Ba-z%5D%5Ba-zA-Z0-9%5D*ColorFillStops%24/anyOf/1/maxItems", keyword: "maxItems", params: { limit: 2 }, message: "must NOT have more than 2 items" };
                                                    if (vErrors === null) {
                                                      vErrors = [err87];
                                                    } else {
                                                      vErrors.push(err87);
                                                    }
                                                    errors++;
                                                  } else {
                                                    if (data23.length < 0) {
                                                      const err88 = { instancePath: instancePath + "/" + key8.replace(/~/g, "~0").replace(/\//g, "~1"), schemaPath: "#/patternProperties/%5E%5Ba-z%5D%5Ba-zA-Z0-9%5D*ColorFillStops%24/anyOf/1/minItems", keyword: "minItems", params: { limit: 0 }, message: "must NOT have fewer than 0 items" };
                                                      if (vErrors === null) {
                                                        vErrors = [err88];
                                                      } else {
                                                        vErrors.push(err88);
                                                      }
                                                      errors++;
                                                    } else {
                                                      var valid41 = true;
                                                      const len8 = data23.length;
                                                      for (let i8 = 0; i8 < len8; i8++) {
                                                        let data24 = data23[i8];
                                                        const _errs110 = errors;
                                                        const _errs111 = errors;
                                                        if (!(typeof data24 == "number" && (!(data24 % 1) && !isNaN(data24)) && isFinite(data24))) {
                                                          const err89 = { instancePath: instancePath + "/" + key8.replace(/~/g, "~0").replace(/\//g, "~1") + "/" + i8, schemaPath: "#/definitions/colorFillStops/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
                                                          if (vErrors === null) {
                                                            vErrors = [err89];
                                                          } else {
                                                            vErrors.push(err89);
                                                          }
                                                          errors++;
                                                        }
                                                        if (errors === _errs111) {
                                                          if (typeof data24 == "number" && isFinite(data24)) {
                                                            if (data24 < 2 || isNaN(data24)) {
                                                              const err90 = { instancePath: instancePath + "/" + key8.replace(/~/g, "~0").replace(/\//g, "~1") + "/" + i8, schemaPath: "#/definitions/colorFillStops/minimum", keyword: "minimum", params: { comparison: ">=", limit: 2 }, message: "must be >= 2" };
                                                              if (vErrors === null) {
                                                                vErrors = [err90];
                                                              } else {
                                                                vErrors.push(err90);
                                                              }
                                                              errors++;
                                                            }
                                                          }
                                                        }
                                                        var valid41 = _errs110 === errors;
                                                        if (!valid41) {
                                                          break;
                                                        }
                                                      }
                                                    }
                                                  }
                                                } else {
                                                  const err91 = { instancePath: instancePath + "/" + key8.replace(/~/g, "~0").replace(/\//g, "~1"), schemaPath: "#/patternProperties/%5E%5Ba-z%5D%5Ba-zA-Z0-9%5D*ColorFillStops%24/anyOf/1/type", keyword: "type", params: { type: "array" }, message: "must be array" };
                                                  if (vErrors === null) {
                                                    vErrors = [err91];
                                                  } else {
                                                    vErrors.push(err91);
                                                  }
                                                  errors++;
                                                }
                                              }
                                              var _valid8 = _errs108 === errors;
                                              valid39 = valid39 || _valid8;
                                            }
                                            if (!valid39) {
                                              const err92 = { instancePath: instancePath + "/" + key8.replace(/~/g, "~0").replace(/\//g, "~1"), schemaPath: "#/patternProperties/%5E%5Ba-z%5D%5Ba-zA-Z0-9%5D*ColorFillStops%24/anyOf", keyword: "anyOf", params: {}, message: "must match a schema in anyOf" };
                                              if (vErrors === null) {
                                                vErrors = [err92];
                                              } else {
                                                vErrors.push(err92);
                                              }
                                              errors++;
                                              validate102.errors = vErrors;
                                              return false;
                                            } else {
                                              errors = _errs104;
                                              if (vErrors !== null) {
                                                if (_errs104) {
                                                  vErrors.length = _errs104;
                                                } else {
                                                  vErrors = null;
                                                }
                                              }
                                            }
                                            var valid23 = _errs103 === errors;
                                            if (!valid23) {
                                              break;
                                            }
                                          }
                                        }
                                        if (valid23) {
                                          var valid23 = true;
                                          for (const key9 in data) {
                                            if (pattern52.test(key9)) {
                                              const _errs113 = errors;
                                              if (!validate13(data[key9], { instancePath: instancePath + "/" + key9.replace(/~/g, "~0").replace(/\//g, "~1"), parentData: data, parentDataProperty: key9, rootData })) {
                                                vErrors = vErrors === null ? validate13.errors : vErrors.concat(validate13.errors);
                                                errors = vErrors.length;
                                              }
                                              var valid23 = _errs113 === errors;
                                              if (!valid23) {
                                                break;
                                              }
                                            }
                                          }
                                          if (valid23) {
                                            var valid23 = true;
                                            for (const key10 in data) {
                                              if (pattern62.test(key10)) {
                                                const _errs115 = errors;
                                                if (!validate13(data[key10], { instancePath: instancePath + "/" + key10.replace(/~/g, "~0").replace(/\//g, "~1"), parentData: data, parentDataProperty: key10, rootData })) {
                                                  vErrors = vErrors === null ? validate13.errors : vErrors.concat(validate13.errors);
                                                  errors = vErrors.length;
                                                }
                                                var valid23 = _errs115 === errors;
                                                if (!valid23) {
                                                  break;
                                                }
                                              }
                                            }
                                            if (valid23) {
                                              var valid23 = true;
                                              for (const key11 in data) {
                                                if (pattern72.test(key11)) {
                                                  const _errs117 = errors;
                                                  if (!validate16(data[key11], { instancePath: instancePath + "/" + key11.replace(/~/g, "~0").replace(/\//g, "~1"), parentData: data, parentDataProperty: key11, rootData })) {
                                                    vErrors = vErrors === null ? validate16.errors : vErrors.concat(validate16.errors);
                                                    errors = vErrors.length;
                                                  }
                                                  var valid23 = _errs117 === errors;
                                                  if (!valid23) {
                                                    break;
                                                  }
                                                }
                                              }
                                              if (valid23) {
                                                var valid23 = true;
                                                for (const key12 in data) {
                                                  if (pattern82.test(key12)) {
                                                    const _errs119 = errors;
                                                    if (!validate16(data[key12], { instancePath: instancePath + "/" + key12.replace(/~/g, "~0").replace(/\//g, "~1"), parentData: data, parentDataProperty: key12, rootData })) {
                                                      vErrors = vErrors === null ? validate16.errors : vErrors.concat(validate16.errors);
                                                      errors = vErrors.length;
                                                    }
                                                    var valid23 = _errs119 === errors;
                                                    if (!valid23) {
                                                      break;
                                                    }
                                                  }
                                                }
                                              }
                                            }
                                          }
                                        }
                                      }
                                    }
                                  }
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    } else {
      validate102.errors = [{ instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" }];
      return false;
    }
  }
  validate102.errors = vErrors;
  return errors === 0;
}
var OptionsValidator = class {
  static validate(data) {
    if (!validate102(data)) {
      throw new OptionsValidationError(validate102.errors || []);
    }
  }
};

// node_modules/@dicebear/core/lib/Options.js
var __classPrivateFieldSet12 = function(receiver, state, value, kind, f) {
  if (kind === "m") throw new TypeError("Private method is not writable");
  if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a setter");
  if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
  return kind === "a" ? f.call(receiver, value) : f ? f.value = value : state.set(receiver, value), value;
};
var __classPrivateFieldGet12 = function(receiver, state, kind, f) {
  if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
  if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
  return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
};
var _Options_instances;
var _Options_data;
var _Options_tags;
var _Options_dynamic;
var _Options_asArray;
var _Options_toRange;
var Options = class {
  constructor(data = {}) {
    _Options_instances.add(this);
    _Options_data.set(this, void 0);
    _Options_tags.set(this, void 0);
    OptionsValidator.validate(data);
    __classPrivateFieldSet12(this, _Options_data, structuredClone(data), "f");
  }
  seed() {
    return __classPrivateFieldGet12(this, _Options_data, "f").seed;
  }
  size() {
    return __classPrivateFieldGet12(this, _Options_data, "f").size;
  }
  idRandomization() {
    return __classPrivateFieldGet12(this, _Options_data, "f").idRandomization;
  }
  title() {
    return __classPrivateFieldGet12(this, _Options_data, "f").title;
  }
  flip() {
    return __classPrivateFieldGet12(this, _Options_instances, "m", _Options_asArray).call(this, __classPrivateFieldGet12(this, _Options_data, "f").flip);
  }
  fontFamily() {
    return __classPrivateFieldGet12(this, _Options_instances, "m", _Options_asArray).call(this, __classPrivateFieldGet12(this, _Options_data, "f").fontFamily);
  }
  fontWeight() {
    return __classPrivateFieldGet12(this, _Options_instances, "m", _Options_asArray).call(this, __classPrivateFieldGet12(this, _Options_data, "f").fontWeight);
  }
  scale() {
    return __classPrivateFieldGet12(this, _Options_instances, "m", _Options_toRange).call(this, __classPrivateFieldGet12(this, _Options_data, "f").scale);
  }
  borderRadius() {
    return __classPrivateFieldGet12(this, _Options_instances, "m", _Options_toRange).call(this, __classPrivateFieldGet12(this, _Options_data, "f").borderRadius);
  }
  rotate() {
    return __classPrivateFieldGet12(this, _Options_instances, "m", _Options_toRange).call(this, __classPrivateFieldGet12(this, _Options_data, "f").rotate);
  }
  translateX() {
    return __classPrivateFieldGet12(this, _Options_instances, "m", _Options_toRange).call(this, __classPrivateFieldGet12(this, _Options_data, "f").translateX);
  }
  translateY() {
    return __classPrivateFieldGet12(this, _Options_instances, "m", _Options_toRange).call(this, __classPrivateFieldGet12(this, _Options_data, "f").translateY);
  }
  /**
   * Returns the global `tags` filter as parsed tokens, or an empty array when
   * unset. Each raw token (`category` / `category:value`, optionally
   * `!`-prefixed to disallow) is decoded into `{ category, value?, negated }` so
   * the resolver composes the filter without parsing the grammar itself. An
   * empty list means no tag filtering (classic behavior). Memoized, since the
   * resolver reads it once per component.
   */
  tags() {
    return __classPrivateFieldSet12(this, _Options_tags, __classPrivateFieldGet12(this, _Options_tags, "f") ?? __classPrivateFieldGet12(this, _Options_instances, "m", _Options_asArray).call(this, __classPrivateFieldGet12(this, _Options_data, "f").tags).map((token) => {
      const negated = token.startsWith("!");
      const body = negated ? token.slice(1) : token;
      const sep = body.indexOf(":");
      return sep === -1 ? { category: body, negated } : { category: body.slice(0, sep), value: body.slice(sep + 1), negated };
    }), "f");
  }
  /**
   * Returns the user-set variant constraint for `name` as a weighted map, or
   * `undefined` when `${name}Variant` is unset. A bare string or string list
   * is normalized to a map with each entry weighted `1`.
   */
  componentVariant(name) {
    const raw = __classPrivateFieldGet12(this, _Options_instances, "m", _Options_dynamic).call(this, `${name}Variant`);
    if (raw === void 0) {
      return void 0;
    }
    if (typeof raw === "string") {
      return { [raw]: 1 };
    }
    if (Array.isArray(raw)) {
      return Object.fromEntries(raw.map((v) => [v, 1]));
    }
    return raw;
  }
  componentProbability(name) {
    return __classPrivateFieldGet12(this, _Options_instances, "m", _Options_dynamic).call(this, `${name}Probability`);
  }
  /**
   * Asymmetric on purpose: returns `undefined` (rather than `[]`) when
   * `${name}Color` is unset so the resolver can fall back to the style
   * definition's color values.
   */
  color(name) {
    const raw = __classPrivateFieldGet12(this, _Options_instances, "m", _Options_dynamic).call(this, `${name}Color`);
    return raw === void 0 ? void 0 : __classPrivateFieldGet12(this, _Options_instances, "m", _Options_asArray).call(this, raw);
  }
  colorFill(name) {
    return __classPrivateFieldGet12(this, _Options_instances, "m", _Options_asArray).call(this, __classPrivateFieldGet12(this, _Options_instances, "m", _Options_dynamic).call(this, `${name}ColorFill`));
  }
  colorAngle(name) {
    return __classPrivateFieldGet12(this, _Options_instances, "m", _Options_toRange).call(this, __classPrivateFieldGet12(this, _Options_instances, "m", _Options_dynamic).call(this, `${name}ColorAngle`));
  }
  colorFillStops(name) {
    return __classPrivateFieldGet12(this, _Options_instances, "m", _Options_toRange).call(this, __classPrivateFieldGet12(this, _Options_instances, "m", _Options_dynamic).call(this, `${name}ColorFillStops`));
  }
};
_Options_data = /* @__PURE__ */ new WeakMap(), _Options_tags = /* @__PURE__ */ new WeakMap(), _Options_instances = /* @__PURE__ */ new WeakSet(), _Options_dynamic = function _Options_dynamic2(key) {
  return __classPrivateFieldGet12(this, _Options_data, "f")[key];
}, _Options_asArray = function _Options_asArray2(value) {
  if (value === void 0) {
    return [];
  }
  if (Array.isArray(value)) {
    return value;
  }
  return [value];
}, _Options_toRange = function _Options_toRange2(value) {
  if (value === void 0) {
    return void 0;
  }
  if (typeof value === "number") {
    return { min: value, max: value };
  }
  if (value.length === 0) {
    return void 0;
  }
  return { min: Math.min(...value), max: Math.max(...value) };
};

// node_modules/@dicebear/core/lib/Prng/Fnv1a.js
var Fnv1a = class _Fnv1a {
  /**
   * Returns the unsigned 32-bit FNV-1a hash of `input`. UTF-16 code units
   * are hashed directly so the result is identical across language ports.
   */
  static hash(input) {
    let hash = 2166136261;
    for (let i = 0; i < input.length; i++) {
      hash ^= input.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }
  /**
   * Returns the FNV-1a hash of `input` as an 8-character lowercase hex string.
   */
  static hex(input) {
    return _Fnv1a.hash(input).toString(16).padStart(8, "0");
  }
};

// node_modules/@dicebear/core/lib/Prng/Mulberry32.js
var __classPrivateFieldSet13 = function(receiver, state, value, kind, f) {
  if (kind === "m") throw new TypeError("Private method is not writable");
  if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a setter");
  if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
  return kind === "a" ? f.call(receiver, value) : f ? f.value = value : state.set(receiver, value), value;
};
var __classPrivateFieldGet13 = function(receiver, state, kind, f) {
  if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
  if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
  return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
};
var _Mulberry32_state;
var UINT32_MAX_PLUS_1 = 2 ** 32;
var Mulberry32 = class {
  constructor(seed) {
    _Mulberry32_state.set(this, void 0);
    __classPrivateFieldSet13(this, _Mulberry32_state, seed, "f");
  }
  /**
   * Advances the state and returns the next unsigned 32-bit value.
   */
  next() {
    const z = __classPrivateFieldSet13(this, _Mulberry32_state, __classPrivateFieldGet13(this, _Mulberry32_state, "f") + 1831565813 | 0, "f");
    let t = Math.imul(z ^ z >>> 15, z | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return (t ^ t >>> 14) >>> 0;
  }
  /**
   * Advances the state and returns the next value in `[0, 1)`.
   */
  nextFloat() {
    return this.next() / UINT32_MAX_PLUS_1;
  }
  /**
   * Returns the current internal state, useful for snapshotting.
   */
  state() {
    return __classPrivateFieldGet13(this, _Mulberry32_state, "f");
  }
};
_Mulberry32_state = /* @__PURE__ */ new WeakMap();

// node_modules/@dicebear/core/lib/Prng.js
var __classPrivateFieldSet14 = function(receiver, state, value, kind, f) {
  if (kind === "m") throw new TypeError("Private method is not writable");
  if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a setter");
  if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
  return kind === "a" ? f.call(receiver, value) : f ? f.value = value : state.set(receiver, value), value;
};
var __classPrivateFieldGet14 = function(receiver, state, kind, f) {
  if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
  if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
  return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
};
var _Prng_instances;
var _Prng_seed;
var _Prng_uniqueByCodePoint;
var _Prng_compareByCodePoint;
var Prng = class {
  constructor(seed) {
    _Prng_instances.add(this);
    _Prng_seed.set(this, void 0);
    __classPrivateFieldSet14(this, _Prng_seed, seed, "f");
  }
  /**
   * Picks a single item from `items` deterministically. Returns `undefined`
   * for an empty list. Duplicate values (by string representation) are
   * collapsed before picking so that input order and duplication do not
   * affect the result.
   */
  pick(key, items) {
    if (items.length === 0) {
      return void 0;
    }
    if (items.length === 1) {
      return items[0];
    }
    const unique = __classPrivateFieldGet14(this, _Prng_instances, "m", _Prng_uniqueByCodePoint).call(this, items);
    if (unique.length === 1) {
      return unique[0];
    }
    const sorted = unique.sort(__classPrivateFieldGet14(this, _Prng_instances, "m", _Prng_compareByCodePoint));
    const index = Math.floor(this.getValue(key) * sorted.length);
    return sorted[index];
  }
  /**
   * Picks a key from `weights` proportional to its weight. When all weights
   * are zero, falls back to an unweighted {@link pick}. Returns `undefined`
   * for an empty map.
   */
  weightedPick(key, weights) {
    const keys = Object.keys(weights);
    if (keys.length === 0) {
      return void 0;
    }
    if (keys.length === 1) {
      return keys[0];
    }
    const sorted = keys.sort(__classPrivateFieldGet14(this, _Prng_instances, "m", _Prng_compareByCodePoint));
    const totalWeight = sorted.reduce((sum, k) => sum + weights[k], 0);
    if (totalWeight === 0) {
      return this.pick(key, sorted);
    }
    const threshold = this.getValue(key) * totalWeight;
    let cumulative = 0;
    for (const k of sorted) {
      cumulative += weights[k];
      if (threshold < cumulative) {
        return k;
      }
    }
    return sorted[sorted.length - 1];
  }
  /**
   * Returns `true` with the given probability (0–100, default 50).
   */
  bool(key, likelihood = 50) {
    return this.getValue(key) * 100 < likelihood;
  }
  /**
   * Returns a deterministic float in `range`, rounded to four decimal places.
   * With `range.step > 0`, the result is drawn uniformly from
   * `{ min + i*step | 0 ≤ i ≤ floor((max - min) / step) }`, so both endpoints
   * of an evenly-divisible range are equally likely. Non-positive or absent
   * step means continuous. `min`/`max` are sorted internally, so a reversed
   * pair is tolerated.
   */
  float(key, range) {
    const min = Math.min(range.min, range.max);
    const max = Math.max(range.min, range.max);
    const step = range.step ?? 0;
    let value;
    if (step > 0) {
      const buckets = Math.floor((max - min) / step) + 1;
      const i = Math.floor(this.getValue(key) * buckets);
      value = min + i * step;
    } else {
      value = min + this.getValue(key) * (max - min);
    }
    return Math.round(value * 1e4) / 1e4;
  }
  /**
   * Returns a deterministic integer in `range`. `min`/`max` are sorted
   * internally, so a reversed pair is tolerated. `range.step` is accepted
   * for symmetry with {@link float} but ignored — integers already step by 1.
   */
  integer(key, range) {
    const min = Math.min(range.min, range.max);
    const max = Math.max(range.min, range.max);
    return Math.floor(this.getValue(key) * (max - min + 1)) + min;
  }
  /**
   * Fisher-Yates shuffle with chained Mulberry32 state. Duplicate values
   * (by string representation) are collapsed before shuffling, so a
   * caller's slice off the front cannot accidentally produce a repeated
   * value.
   */
  shuffle(key, items) {
    if (items.length <= 1) {
      return [...items];
    }
    const result = __classPrivateFieldGet14(this, _Prng_instances, "m", _Prng_uniqueByCodePoint).call(this, items).sort(__classPrivateFieldGet14(this, _Prng_instances, "m", _Prng_compareByCodePoint));
    const prng = new Mulberry32(Fnv1a.hash(__classPrivateFieldGet14(this, _Prng_seed, "f") + ":" + key));
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(prng.nextFloat() * (i + 1));
      const temp = result[i];
      result[i] = result[j];
      result[j] = temp;
    }
    return result;
  }
  /**
   * Returns a single float in `[0, 1)` derived from `seed:key`. The same
   * seed/key pair always produces the same value.
   */
  getValue(key) {
    return new Mulberry32(Fnv1a.hash(__classPrivateFieldGet14(this, _Prng_seed, "f") + ":" + key)).nextFloat();
  }
};
_Prng_seed = /* @__PURE__ */ new WeakMap(), _Prng_instances = /* @__PURE__ */ new WeakSet(), _Prng_uniqueByCodePoint = function _Prng_uniqueByCodePoint2(items, keyFn = String) {
  const seen = /* @__PURE__ */ new Set();
  const result = [];
  for (const item of items) {
    const repr = keyFn(item);
    if (!seen.has(repr)) {
      seen.add(repr);
      result.push(item);
    }
  }
  return result;
}, _Prng_compareByCodePoint = function _Prng_compareByCodePoint2(a, b) {
  const sa = String(a);
  const sb = String(b);
  if (sa < sb) {
    return -1;
  }
  if (sa > sb) {
    return 1;
  }
  return 0;
};

// node_modules/@dicebear/core/lib/Utils/Color.js
var __classPrivateFieldGet15 = function(receiver, state, kind, f) {
  if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
  if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
  return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
};
var _a2;
var _Color_LINEARIZED;
var _Color_linearize;
var Color2 = class {
  /**
   * Normalizes any hex format to 6- or 8-digit lowercase with `#` prefix.
   */
  static toHex(hex) {
    const h = hex.replace(/^#/, "").toLowerCase();
    if (h.length === 3) {
      return "#" + h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    }
    if (h.length === 4) {
      return "#" + h[0] + h[0] + h[1] + h[1] + h[2] + h[2] + h[3] + h[3];
    }
    return "#" + h;
  }
  /**
   * Like {@link toHex}, but strips the alpha channel and always returns
   * 6-digit hex.
   */
  static toRgbHex(hex) {
    const h = this.toHex(hex);
    return h.length > 7 ? h.slice(0, 7) : h;
  }
  /**
   * Parses a hex color into an `[r, g, b]` triple of 8-bit channel values.
   */
  static parseHex(hex) {
    const h = this.toHex(hex).slice(1);
    return [
      parseInt(h.slice(0, 2), 16),
      parseInt(h.slice(2, 4), 16),
      parseInt(h.slice(4, 6), 16)
    ];
  }
  /**
   * WCAG 2.1 relative luminance with sRGB linearization.
   *
   * @see https://www.w3.org/WAI/GL/wiki/Relative_luminance
   */
  static luminance(hex) {
    const rgb = this.parseHex(hex);
    const linearR = __classPrivateFieldGet15(this, _a2, "m", _Color_linearize).call(this, rgb[0]);
    const linearG = __classPrivateFieldGet15(this, _a2, "m", _Color_linearize).call(this, rgb[1]);
    const linearB = __classPrivateFieldGet15(this, _a2, "m", _Color_linearize).call(this, rgb[2]);
    return 0.2126 * linearR + 0.7152 * linearG + 0.0722 * linearB;
  }
  /**
   * Returns a new array sorted by descending contrast against the reference
   * color.
   *
   * @see https://www.w3.org/WAI/GL/wiki/Contrast_ratio
   */
  static sortByContrast(candidates, refColor) {
    const refLum = this.luminance(refColor);
    const withRatio = candidates.map((c) => {
      const lum = this.luminance(c);
      const ratio = (Math.max(lum, refLum) + 0.05) / (Math.min(lum, refLum) + 0.05);
      return { color: c, ratio };
    });
    withRatio.sort((a, b) => b.ratio - a.ratio);
    return withRatio.map((e) => e.color);
  }
  /**
   * Returns a new array with excluded colors removed. Falls back to the
   * original candidates when filtering would empty the list.
   */
  static filterNotEqualTo(candidates, excluded) {
    const normalized = new Set(excluded.map((c) => this.toRgbHex(c)));
    const filtered = candidates.filter((c) => !normalized.has(this.toRgbHex(c)));
    return filtered.length > 0 ? filtered : Array.from(candidates);
  }
};
_a2 = Color2, _Color_linearize = function _Color_linearize2(channel) {
  return __classPrivateFieldGet15(_a2, _a2, "f", _Color_LINEARIZED)[channel];
};
_Color_LINEARIZED = { value: [
  0,
  3035269835488375e-19,
  607053967097675e-18,
  9105809506465125e-19,
  0.00121410793419535,
  0.0015176349177441874,
  0.001821161901293025,
  0.0021246888848418626,
  0.0024282158683907,
  0.0027317428519395373,
  0.003035269835488375,
  0.003346535763899161,
  0.003676507324047436,
  0.004024717018496307,
  0.004391442037410293,
  0.004776953480693729,
  0.005181516702338386,
  0.005605391624202723,
  0.006048833022857055,
  0.006512090792594474,
  0.006995410187265387,
  0.007499032043226175,
  0.008023192985384994,
  0.008568125618069307,
  0.009134058702220787,
  0.009721217320237847,
  0.010329823029626938,
  0.010960094006488246,
  0.011612245179743887,
  0.012286488356915872,
  0.012983032342173012,
  0.013702083047289686,
  0.014443843596092545,
  0.01520851442291271,
  0.01599629336550963,
  0.016807375752887384,
  0.017641954488384078,
  0.018500220128379697,
  0.019382360956935723,
  0.0202885630566524,
  0.021219010376003558,
  0.02217388479338738,
  0.02315336617811041,
  0.024157632448504756,
  0.025186859627361627,
  0.026241221894849898,
  0.027320891639074897,
  0.028426039504420793,
  0.0295568344378088,
  0.030713443732993635,
  0.03189603307301153,
  0.033104766570885055,
  0.03433980680868217,
  0.03560131487502034,
  0.03688945040110004,
  0.0382043715953465,
  0.03954623527673283,
  0.04091519690685319,
  0.042311410620809675,
  0.043735029256973465,
  0.04518620438567554,
  0.0466650863368801,
  0.048171824226889426,
  0.04970656598412723,
  0.05126945837404324,
  0.052860647023180246,
  0.05448027644244237,
  0.05612849004960009,
  0.05780543019106723,
  0.0595112381629812,
  0.06124605423161761,
  0.06301001765316767,
  0.06480326669290577,
  0.06662593864377289,
  0.06847816984440017,
  0.07036009569659588,
  0.07227185068231748,
  0.07421356838014963,
  0.07618538148130785,
  0.07818742180518633,
  0.08021982031446831,
  0.0822827071298148,
  0.08437621154414882,
  0.08650046203654976,
  0.08865558628577294,
  0.09084171118340767,
  0.09305896284668747,
  0.0953074666309647,
  0.09758734714186246,
  0.09989872824711389,
  0.1022417330881013,
  0.10461648409110419,
  0.10702310297826761,
  0.10946171077829933,
  0.1119324278369056,
  0.11443537382697373,
  0.11697066775851084,
  0.11953842798834562,
  0.12213877222960187,
  0.12477181756095049,
  0.12743768043564743,
  0.1301364766903643,
  0.13286832155381798,
  0.13563332965520566,
  0.13843161503245183,
  0.14126329114027164,
  0.14412847085805777,
  0.14702726649759498,
  0.14995978981060856,
  0.15292615199615017,
  0.1559264637078274,
  0.1589608350608804,
  0.16202937563911096,
  0.1651321945016676,
  0.16826940018969075,
  0.1714411007328226,
  0.17464740365558504,
  0.17788841598362914,
  0.18116424424986022,
  0.184474994500441,
  0.18782077230067787,
  0.1912016827407914,
  0.19461783044157582,
  0.19806931955994886,
  0.20155625379439707,
  0.20507873639031693,
  0.20863687014525575,
  0.21223075741405523,
  0.21586050011389923,
  0.21952619972926923,
  0.2232279573168085,
  0.22696587351009836,
  0.23074004852434915,
  0.23455058216100522,
  0.238397573812271,
  0.24228112246555486,
  0.24620132670783548,
  0.25015828472995344,
  0.25415209433082675,
  0.2581828529215958,
  0.26225065752969623,
  0.26635560480286247,
  0.2704977910130658,
  0.27467731206038465,
  0.2788942634768104,
  0.2831487404299921,
  0.2874408377269175,
  0.29177064981753587,
  0.2961382707983211,
  0.3005437944157765,
  0.3049873140698863,
  0.30946892281750854,
  0.31398871337571754,
  0.31854677812509186,
  0.32314320911295075,
  0.3277780980565422,
  0.33245153634617935,
  0.33716361504833037,
  0.341914424908661,
  0.3467040563550296,
  0.35153259950043936,
  0.3564001441459435,
  0.3613067797835095,
  0.3662525955988395,
  0.3712376804741491,
  0.37626212299090644,
  0.3813260114325301,
  0.386429433787049,
  0.39157247774972326,
  0.39675523072562685,
  0.40197777983219574,
  0.4072402119017367,
  0.41254261348390375,
  0.4178850708481375,
  0.4232676699860717,
  0.4286904966139067,
  0.4341536361747489,
  0.4396571738409188,
  0.44520119451622786,
  0.45078578283822346,
  0.45641102318040466,
  0.4620769996544071,
  0.467783796112159,
  0.47353149614800955,
  0.4793201831008268,
  0.4851499400560704,
  0.4910208498478356,
  0.4969329950608704,
  0.5028864580325687,
  0.5088813208549338,
  0.5149176653765214,
  0.5209955732043543,
  0.5271151257058131,
  0.5332764040105052,
  0.5394794890121071,
  0.5457244613701866,
  0.5520114015120001,
  0.5583403896342679,
  0.5647115057049292,
  0.5711248294648731,
  0.5775804404296506,
  0.5840784178911641,
  0.5906188409193369,
  0.5972017883637634,
  0.6038273388553378,
  0.6104955708078648,
  0.6172065624196511,
  0.6239603916750761,
  0.6307571363461468,
  0.6375968739940326,
  0.6444796819705821,
  0.6514056374198242,
  0.6583748172794486,
  0.665387298282272,
  0.6724431569576875,
  0.6795424696330938,
  0.6866853124353134,
  0.6938717612919899,
  0.7011018919329731,
  0.7083757798916868,
  0.7156935005064807,
  0.7230551289219693,
  0.7304607400903537,
  0.7379104087727308,
  0.7454042095403874,
  0.7529422167760779,
  0.7605245046752924,
  0.7681511472475071,
  0.7758222183174236,
  0.7835377915261935,
  0.7912979403326302,
  0.799102738014409,
  0.8069522576692516,
  0.8148465722161012,
  0.8227857543962835,
  0.8307698767746546,
  0.83879901174074,
  0.846873231509858,
  0.8549926081242338,
  0.8631572134541023,
  0.8713671191987973,
  0.8796223968878317,
  0.8879231178819663,
  0.8962693533742664,
  0.9046611743911496,
  0.9130986517934192,
  0.9215818562772946,
  0.9301108583754237,
  0.938685728457888,
  0.9473065367331999,
  0.9559733532492861,
  0.9646862478944651,
  0.9734452903984125,
  0.9822505503331171,
  0.9911020971138298,
  1
] };

// node_modules/@dicebear/core/lib/Error/CircularColorReferenceError.js
var CircularColorReferenceError = class extends Error {
  constructor(chain) {
    const path = chain.join(" \u2192 ");
    super(`Circular color reference: ${path}`);
    this.name = "CircularColorReferenceError";
    this.chain = chain;
  }
};

// node_modules/@dicebear/core/lib/Resolver.js
var __classPrivateFieldSet15 = function(receiver, state, value, kind, f) {
  if (kind === "m") throw new TypeError("Private method is not writable");
  if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a setter");
  if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
  return kind === "a" ? f.call(receiver, value) : f ? f.value = value : state.set(receiver, value), value;
};
var __classPrivateFieldGet16 = function(receiver, state, kind, f) {
  if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
  if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
  return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
};
var _Resolver_instances;
var _Resolver_style;
var _Resolver_options;
var _Resolver_prng;
var _Resolver_colorResolving;
var _Resolver_result;
var _Resolver_tagFilterCache;
var _Resolver_probability;
var _Resolver_isVisible;
var _Resolver_variantWeights;
var _Resolver_tagFilter;
var _Resolver_tagFilteredNames;
var _Resolver_resolveColor;
var _Resolver_colorFillStops;
var _Resolver_memoFloat;
var _Resolver_memo;
var Resolver = class {
  constructor(style, options) {
    _Resolver_instances.add(this);
    _Resolver_style.set(this, void 0);
    _Resolver_options.set(this, void 0);
    _Resolver_prng.set(this, void 0);
    _Resolver_colorResolving.set(this, []);
    _Resolver_result.set(this, {});
    _Resolver_tagFilterCache.set(this, void 0);
    __classPrivateFieldSet15(this, _Resolver_style, style, "f");
    __classPrivateFieldSet15(this, _Resolver_options, options, "f");
    __classPrivateFieldSet15(this, _Resolver_prng, new Prng(this.seed()), "f");
  }
  seed() {
    return __classPrivateFieldGet16(this, _Resolver_options, "f").seed() ?? "";
  }
  size() {
    return __classPrivateFieldGet16(this, _Resolver_instances, "m", _Resolver_memo).call(this, "size", () => __classPrivateFieldGet16(this, _Resolver_options, "f").size());
  }
  idRandomization() {
    return __classPrivateFieldGet16(this, _Resolver_instances, "m", _Resolver_memo).call(this, "idRandomization", () => __classPrivateFieldGet16(this, _Resolver_options, "f").idRandomization() ?? false);
  }
  title() {
    return __classPrivateFieldGet16(this, _Resolver_instances, "m", _Resolver_memo).call(this, "title", () => __classPrivateFieldGet16(this, _Resolver_options, "f").title());
  }
  flip() {
    return __classPrivateFieldGet16(this, _Resolver_instances, "m", _Resolver_memo).call(this, "flip", () => __classPrivateFieldGet16(this, _Resolver_prng, "f").pick("flip", __classPrivateFieldGet16(this, _Resolver_options, "f").flip()) ?? "none");
  }
  fontFamily() {
    return __classPrivateFieldGet16(this, _Resolver_instances, "m", _Resolver_memo).call(this, "fontFamily", () => __classPrivateFieldGet16(this, _Resolver_prng, "f").pick("fontFamily", __classPrivateFieldGet16(this, _Resolver_options, "f").fontFamily()) ?? "system-ui");
  }
  fontWeight() {
    return __classPrivateFieldGet16(this, _Resolver_instances, "m", _Resolver_memo).call(this, "fontWeight", () => __classPrivateFieldGet16(this, _Resolver_prng, "f").pick("fontWeight", __classPrivateFieldGet16(this, _Resolver_options, "f").fontWeight()) ?? 400);
  }
  scale() {
    return __classPrivateFieldGet16(this, _Resolver_instances, "m", _Resolver_memoFloat).call(this, "scale", __classPrivateFieldGet16(this, _Resolver_options, "f").scale(), 1);
  }
  borderRadius() {
    return __classPrivateFieldGet16(this, _Resolver_instances, "m", _Resolver_memoFloat).call(this, "borderRadius", __classPrivateFieldGet16(this, _Resolver_options, "f").borderRadius(), 0);
  }
  rotate() {
    return __classPrivateFieldGet16(this, _Resolver_instances, "m", _Resolver_memoFloat).call(this, "rotate", __classPrivateFieldGet16(this, _Resolver_options, "f").rotate(), 0);
  }
  translateX() {
    return __classPrivateFieldGet16(this, _Resolver_instances, "m", _Resolver_memoFloat).call(this, "translateX", __classPrivateFieldGet16(this, _Resolver_options, "f").translateX(), 0);
  }
  translateY() {
    return __classPrivateFieldGet16(this, _Resolver_instances, "m", _Resolver_memoFloat).call(this, "translateY", __classPrivateFieldGet16(this, _Resolver_options, "f").translateY(), 0);
  }
  /**
   * Selects a variant for the given component. The pool the PRNG draws from is
   * built from the per-component `${name}Variant` option and the global `tags`
   * filter (see {@link #variantWeights}). Only variants that exist in the style
   * definition are considered.
   */
  variant(name) {
    return __classPrivateFieldGet16(this, _Resolver_instances, "m", _Resolver_memo).call(this, `${name}Variant`, () => {
      const component = __classPrivateFieldGet16(this, _Resolver_style, "f").components().get(name);
      if (!component || !__classPrivateFieldGet16(this, _Resolver_instances, "m", _Resolver_isVisible).call(this, name, component)) {
        return void 0;
      }
      return __classPrivateFieldGet16(this, _Resolver_prng, "f").weightedPick(`${name}Variant`, __classPrivateFieldGet16(this, _Resolver_instances, "m", _Resolver_variantWeights).call(this, component));
    });
  }
  color(name) {
    return __classPrivateFieldGet16(this, _Resolver_instances, "m", _Resolver_memo).call(this, `${name}Color`, () => __classPrivateFieldGet16(this, _Resolver_instances, "m", _Resolver_resolveColor).call(this, name));
  }
  colorFill(name) {
    return __classPrivateFieldGet16(this, _Resolver_instances, "m", _Resolver_memo).call(this, `${name}ColorFill`, () => __classPrivateFieldGet16(this, _Resolver_prng, "f").pick(`${name}ColorFill`, __classPrivateFieldGet16(this, _Resolver_options, "f").colorFill(name)) ?? "solid");
  }
  colorAngle(name) {
    return __classPrivateFieldGet16(this, _Resolver_instances, "m", _Resolver_memoFloat).call(this, `${name}ColorAngle`, __classPrivateFieldGet16(this, _Resolver_options, "f").colorAngle(name), 0);
  }
  /**
   * Picks the rotate/translateX/translateY/scale values for a single
   * component. Memoized per `name`, so the four values land in
   * {@link resolved} as `${name}Rotate` / `${name}TranslateX` /
   * `${name}TranslateY` / `${name}Scale` for downstream introspection.
   */
  componentTransform(name) {
    const component = __classPrivateFieldGet16(this, _Resolver_style, "f").components().get(name);
    return {
      rotate: __classPrivateFieldGet16(this, _Resolver_instances, "m", _Resolver_memoFloat).call(this, `${name}Rotate`, component?.rotate(), 0),
      translateX: __classPrivateFieldGet16(this, _Resolver_instances, "m", _Resolver_memoFloat).call(this, `${name}TranslateX`, component?.translate().x(), 0),
      translateY: __classPrivateFieldGet16(this, _Resolver_instances, "m", _Resolver_memoFloat).call(this, `${name}TranslateY`, component?.translate().y(), 0),
      scale: __classPrivateFieldGet16(this, _Resolver_instances, "m", _Resolver_memoFloat).call(this, `${name}Scale`, component?.scale(), 1)
    };
  }
  /**
   * Returns an informational snapshot of every value the resolver picked.
   * Includes top-level options (scale/rotate/translate/…), per-component
   * variants/probabilities/colors, and per-component transform picks. The
   * raw seed is deliberately excluded.
   *
   * The snapshot is NOT a round-trip-able options object — extra keys like
   * `${name}Rotate` are not part of {@link StyleOptions} and feeding the
   * snapshot back into a new {@link Avatar} is not supported. Callers that
   * need to reproduce an avatar should pass the original `seed` and
   * user-supplied options.
   *
   * The returned object aliases the internal cache; callers that need
   * isolation (e.g. {@link Avatar.toJSON}) clone it themselves.
   */
  resolved() {
    return __classPrivateFieldGet16(this, _Resolver_result, "f");
  }
};
_Resolver_style = /* @__PURE__ */ new WeakMap(), _Resolver_options = /* @__PURE__ */ new WeakMap(), _Resolver_prng = /* @__PURE__ */ new WeakMap(), _Resolver_colorResolving = /* @__PURE__ */ new WeakMap(), _Resolver_result = /* @__PURE__ */ new WeakMap(), _Resolver_tagFilterCache = /* @__PURE__ */ new WeakMap(), _Resolver_instances = /* @__PURE__ */ new WeakSet(), _Resolver_probability = function _Resolver_probability2(component) {
  const raw = __classPrivateFieldGet16(this, _Resolver_options, "f").componentProbability(component.sourceName());
  return raw ?? component.probability();
}, _Resolver_isVisible = function _Resolver_isVisible2(name, component) {
  return __classPrivateFieldGet16(this, _Resolver_prng, "f").bool(`${name}Probability`, __classPrivateFieldGet16(this, _Resolver_instances, "m", _Resolver_probability).call(this, component));
}, _Resolver_variantWeights = function _Resolver_variantWeights2(component) {
  const variants = component.variants();
  const named = __classPrivateFieldGet16(this, _Resolver_options, "f").componentVariant(component.sourceName());
  const weights = {};
  const names = named ? Object.keys(named) : __classPrivateFieldGet16(this, _Resolver_options, "f").tags().length > 0 ? __classPrivateFieldGet16(this, _Resolver_instances, "m", _Resolver_tagFilteredNames).call(this, variants) : variants.keys();
  for (const name of names) {
    const variant = variants.get(name);
    if (variant !== void 0) {
      weights[name] = named ? named[name] : variant.weight();
    }
  }
  return weights;
}, _Resolver_tagFilter = function _Resolver_tagFilter2() {
  if (__classPrivateFieldGet16(this, _Resolver_tagFilterCache, "f")) {
    return __classPrivateFieldGet16(this, _Resolver_tagFilterCache, "f");
  }
  const allows = /* @__PURE__ */ new Map();
  const bares = /* @__PURE__ */ new Set();
  const disallows = [];
  const bareDisallows = /* @__PURE__ */ new Set();
  for (const { category, value, negated } of __classPrivateFieldGet16(this, _Resolver_options, "f").tags()) {
    if (negated) {
      disallows.push({ category, value });
      if (value === void 0) {
        bareDisallows.add(category);
      }
    } else if (value !== void 0) {
      const values = allows.get(category) ?? [];
      values.push(value);
      allows.set(category, values);
    } else {
      bares.add(category);
    }
  }
  __classPrivateFieldSet15(this, _Resolver_tagFilterCache, {
    // Materialize the allow groups once, not on every variant.
    allowGroups: [...allows],
    bares,
    disallows,
    bareDisallows
  }, "f");
  return __classPrivateFieldGet16(this, _Resolver_tagFilterCache, "f");
}, _Resolver_tagFilteredNames = function _Resolver_tagFilteredNames2(variants) {
  const { allowGroups, bares, disallows, bareDisallows } = __classPrivateFieldGet16(this, _Resolver_instances, "m", _Resolver_tagFilter).call(this);
  const required = [...bares].filter((category) => {
    if (bareDisallows.has(category)) {
      return false;
    }
    for (const variant of variants.values()) {
      if (variant.hasTag(category)) {
        return true;
      }
    }
    return false;
  });
  const names = [];
  for (const [name, variant] of variants) {
    const allowed = allowGroups.every(([category, values]) => !variant.hasTag(category) || values.some((value) => variant.hasTag(category, value))) && required.every((category) => variant.hasTag(category));
    const disallowed = disallows.some(({ category, value }) => variant.hasTag(category, value));
    if (allowed && !disallowed) {
      names.push(name);
    }
  }
  return names;
}, _Resolver_resolveColor = function _Resolver_resolveColor2(name) {
  const userColors = __classPrivateFieldGet16(this, _Resolver_options, "f").color(name);
  const styleColor = __classPrivateFieldGet16(this, _Resolver_style, "f").colors().get(name);
  const source = userColors ?? styleColor?.values() ?? [];
  let candidates = source.map((c) => Color2.toHex(c));
  const fill = this.colorFill(name);
  const stops = fill === "solid" ? 1 : __classPrivateFieldGet16(this, _Resolver_instances, "m", _Resolver_colorFillStops).call(this, name);
  if (!styleColor) {
    return __classPrivateFieldGet16(this, _Resolver_prng, "f").shuffle(`${name}Color`, candidates).slice(0, stops);
  }
  if (__classPrivateFieldGet16(this, _Resolver_colorResolving, "f").includes(name)) {
    throw new CircularColorReferenceError(__classPrivateFieldGet16(this, _Resolver_colorResolving, "f").concat(name));
  }
  __classPrivateFieldGet16(this, _Resolver_colorResolving, "f").push(name);
  const contrastTo = styleColor.contrastTo();
  const notEqualTo = styleColor.notEqualTo();
  try {
    if (contrastTo) {
      const refColor = this.color(contrastTo)[0];
      if (refColor) {
        candidates = Color2.sortByContrast(candidates, refColor);
      }
    }
    if (notEqualTo.length > 0) {
      const excluded = [];
      for (const ref of notEqualTo) {
        for (const color of this.color(ref)) {
          excluded.push(color);
        }
      }
      candidates = Color2.filterNotEqualTo(candidates, excluded);
    }
  } finally {
    __classPrivateFieldGet16(this, _Resolver_colorResolving, "f").pop();
  }
  const ordered = contrastTo ? candidates : __classPrivateFieldGet16(this, _Resolver_prng, "f").shuffle(`${name}Color`, candidates);
  return ordered.slice(0, stops);
}, _Resolver_colorFillStops = function _Resolver_colorFillStops2(name) {
  const range = __classPrivateFieldGet16(this, _Resolver_options, "f").colorFillStops(name);
  return range ? __classPrivateFieldGet16(this, _Resolver_prng, "f").integer(`${name}ColorFillStops`, range) : 2;
}, _Resolver_memoFloat = function _Resolver_memoFloat2(key, range, fallback) {
  return __classPrivateFieldGet16(this, _Resolver_instances, "m", _Resolver_memo).call(this, key, () => range ? __classPrivateFieldGet16(this, _Resolver_prng, "f").float(key, range) : fallback);
}, _Resolver_memo = function _Resolver_memo2(key, compute) {
  if (key in __classPrivateFieldGet16(this, _Resolver_result, "f")) {
    return __classPrivateFieldGet16(this, _Resolver_result, "f")[key];
  }
  const value = compute();
  __classPrivateFieldGet16(this, _Resolver_result, "f")[key] = value;
  return value;
};

// node_modules/@dicebear/core/lib/Utils/Initials.js
var Initials = class {
  /**
   * Returns one or two uppercase initials for the given seed. By default
   * strips `@...` so email addresses yield a single initial instead of being
   * treated as two words.
   */
  static fromSeed(seed, discardAtSymbol = true) {
    let input = seed;
    if (discardAtSymbol) {
      input = seed.replace(/@.*/s, "");
    }
    input = input.replace(/[`´'ʼ]/g, "");
    const matches = input.match(/(\p{L}[\p{L}\p{M}]*)/gu);
    if (!matches) {
      return discardAtSymbol ? this.fromSeed(seed, false) : "";
    }
    if (matches.length === 1) {
      const match = matches[0].match(/^(?:\p{L}\p{M}*){1,2}/u);
      return match ? match[0].toUpperCase() : "";
    }
    const first = matches[0].match(/^(?:\p{L}\p{M}*)/u);
    const last = matches[matches.length - 1].match(/^(?:\p{L}\p{M}*)/u);
    if (!first || !last) {
      return "";
    }
    return (first[0] + last[0]).toUpperCase();
  }
};

// node_modules/@dicebear/core/lib/Utils/Xml.js
var __classPrivateFieldGet17 = function(receiver, state, kind, f) {
  if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
  if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
  return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
};
var _a3;
var _Xml_entities;
var _Xml_pattern;
var Xml = class {
  /**
   * Returns `value` with the five XML predefined entities escaped.
   */
  static escape(value) {
    return value.replace(__classPrivateFieldGet17(_a3, _a3, "f", _Xml_pattern), (ch) => __classPrivateFieldGet17(_a3, _a3, "f", _Xml_entities)[ch]);
  }
};
_a3 = Xml;
_Xml_entities = { value: {
  "&": "&amp;",
  "'": "&apos;",
  '"': "&quot;",
  "<": "&lt;",
  ">": "&gt;"
} };
_Xml_pattern = { value: new RegExp(`[${Object.keys(__classPrivateFieldGet17(_a3, _a3, "f", _Xml_entities)).join("")}]`, "g") };

// node_modules/@dicebear/core/lib/Utils/License.js
var License = class {
  /**
   * Returns a single-line attribution string suitable for `<title>` or
   * `<desc>` content. Returns an empty string when no attribution data is
   * available.
   */
  static text(meta) {
    const sourceName = meta.source().name();
    const sourceUrl = meta.source().url();
    const creatorName = meta.creator().name();
    const licenseName = meta.license().name();
    const licenseUrl = meta.license().url();
    if (!sourceName && !creatorName && !licenseName) {
      return "";
    }
    let title = sourceName ? `\u201C${sourceName}\u201D` : "Design";
    if (sourceUrl) {
      title += ` (${sourceUrl})`;
    }
    const creator = `\u201C${creatorName ?? "Unknown"}\u201D`;
    let result = "";
    if (licenseName !== "MIT" && creatorName !== "DiceBear" && sourceName) {
      result += "Remix of ";
    }
    result += `${title} by ${creator}`;
    if (licenseName) {
      result += `, licensed under \u201C${licenseName}\u201D`;
      if (licenseUrl) {
        result += ` (${licenseUrl})`;
      }
    }
    return result;
  }
  /**
   * Builds an embedded `<metadata>` block with Dublin Core terms describing
   * the style's source, creator, license, and rights statement. Returns an
   * empty string when no metadata fields are populated.
   */
  static xml(meta) {
    const title = meta.source().name();
    const creatorName = meta.creator().name();
    const sourceUrl = meta.source().url();
    const licenseUrl = meta.license().url();
    const rights = this.text(meta);
    if (!title && !creatorName && !sourceUrl && !licenseUrl && !rights) {
      return "";
    }
    const fields = [];
    if (title) {
      fields.push(`<dc:title>${Xml.escape(title)}</dc:title>`);
    }
    if (creatorName) {
      fields.push(`<dc:creator>${Xml.escape(creatorName)}</dc:creator>`);
    }
    if (sourceUrl) {
      fields.push(`<dc:source xsi:type="dcterms:URI">${Xml.escape(sourceUrl)}</dc:source>`);
    }
    if (licenseUrl) {
      fields.push(`<dcterms:license xsi:type="dcterms:URI">${Xml.escape(licenseUrl)}</dcterms:license>`);
    }
    if (rights) {
      fields.push(`<dc:rights>${Xml.escape(rights)}</dc:rights>`);
    }
    return `<metadata xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/"><rdf:RDF><rdf:Description>${fields.join("")}</rdf:Description></rdf:RDF></metadata>`;
  }
};

// node_modules/@dicebear/core/lib/Utils/Number.js
var Number = class {
  static format(value) {
    if (value !== value) {
      return "NaN";
    }
    if (value === Infinity) {
      return "Infinity";
    }
    if (value === -Infinity) {
      return "-Infinity";
    }
    let scaled = Math.round(value * 1e5);
    const sign = scaled < 0 ? "-" : "";
    scaled = Math.abs(scaled);
    const integerPart = Math.floor(scaled / 1e5);
    const fraction = String(scaled % 1e5).padStart(5, "0").replace(/0+$/, "");
    return `${sign}${integerPart}${fraction ? `.${fraction}` : ""}`;
  }
};

// node_modules/@dicebear/core/lib/Renderer.js
var __classPrivateFieldSet16 = function(receiver, state, value, kind, f) {
  if (kind === "m") throw new TypeError("Private method is not writable");
  if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a setter");
  if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
  return kind === "a" ? f.call(receiver, value) : f ? f.value = value : state.set(receiver, value), value;
};
var __classPrivateFieldGet18 = function(receiver, state, kind, f) {
  if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
  if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
  return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
};
var _Renderer_instances;
var _Renderer_style;
var _Renderer_resolver;
var _Renderer_defs;
var _Renderer_cachedSeedHash;
var _Renderer_cachedInitials;
var _Renderer_applyFlip;
var _Renderer_applyScale;
var _Renderer_applyBorderRadius;
var _Renderer_applyRotate;
var _Renderer_applyTranslate;
var _Renderer_renderBackground;
var _Renderer_randomizeIds;
var _Renderer_renderElements;
var _Renderer_renderElement;
var _Renderer_renderSvgElement;
var _Renderer_renderTextElement;
var _Renderer_renderComponentElement;
var _Renderer_buildTransforms;
var _Renderer_renderAttributes;
var _Renderer_resolveAttributeValue;
var _Renderer_resolveColorReference;
var _Renderer_buildGradientDef;
var _Renderer_resolveValue;
var _Renderer_resolveVariable;
var _Renderer_initials;
var _Renderer_hashSeed;
var Renderer = class {
  constructor(style, resolver) {
    _Renderer_instances.add(this);
    _Renderer_style.set(this, void 0);
    _Renderer_resolver.set(this, void 0);
    _Renderer_defs.set(this, /* @__PURE__ */ new Map());
    _Renderer_cachedSeedHash.set(this, void 0);
    _Renderer_cachedInitials.set(this, void 0);
    __classPrivateFieldSet16(this, _Renderer_style, style, "f");
    __classPrivateFieldSet16(this, _Renderer_resolver, resolver, "f");
  }
  /**
   * Builds the complete SVG document for the avatar.
   */
  render() {
    const canvas = __classPrivateFieldGet18(this, _Renderer_style, "f").canvas();
    const background = __classPrivateFieldGet18(this, _Renderer_instances, "m", _Renderer_renderBackground).call(this, canvas);
    let body = __classPrivateFieldGet18(this, _Renderer_instances, "m", _Renderer_renderElements).call(this, canvas.elements());
    body = __classPrivateFieldGet18(this, _Renderer_instances, "m", _Renderer_applyScale).call(this, body, canvas);
    body = __classPrivateFieldGet18(this, _Renderer_instances, "m", _Renderer_applyFlip).call(this, body, canvas);
    body = __classPrivateFieldGet18(this, _Renderer_instances, "m", _Renderer_applyRotate).call(this, body, canvas);
    body = __classPrivateFieldGet18(this, _Renderer_instances, "m", _Renderer_applyTranslate).call(this, body, canvas);
    body = __classPrivateFieldGet18(this, _Renderer_instances, "m", _Renderer_applyBorderRadius).call(this, `${background}${body}`, canvas);
    const metadata = License.xml(__classPrivateFieldGet18(this, _Renderer_style, "f").meta());
    const defs = __classPrivateFieldGet18(this, _Renderer_defs, "f").size > 0 ? `<defs>${Array.from(__classPrivateFieldGet18(this, _Renderer_defs, "f").values()).join("")}</defs>` : "";
    const size = __classPrivateFieldGet18(this, _Renderer_resolver, "f").size();
    const title = __classPrivateFieldGet18(this, _Renderer_resolver, "f").title();
    const escapedTitle = title !== void 0 ? Xml.escape(title) : void 0;
    const attrs = [
      'xmlns="http://www.w3.org/2000/svg"',
      `viewBox="0 0 ${Number.format(canvas.width())} ${Number.format(canvas.height())}"`
    ];
    const rootAttributes = __classPrivateFieldGet18(this, _Renderer_instances, "m", _Renderer_renderAttributes).call(this, __classPrivateFieldGet18(this, _Renderer_style, "f").attributes());
    if (rootAttributes) {
      attrs.push(rootAttributes.trimStart());
    }
    if (escapedTitle !== void 0) {
      attrs.push('role="img"', `aria-label="${escapedTitle}"`);
    } else {
      attrs.push('aria-hidden="true"');
    }
    if (size !== void 0) {
      const sizeValue = Number.format(size);
      attrs.push(`width="${sizeValue}"`, `height="${sizeValue}"`);
    }
    const titleElement = escapedTitle !== void 0 ? `<title>${escapedTitle}</title>` : "";
    let svg = `<svg ${attrs.join(" ")}><!-- Generated by DiceBear (https://www.dicebear.com) -->${metadata}${defs}${titleElement}${body}</svg>`;
    if (__classPrivateFieldGet18(this, _Renderer_resolver, "f").idRandomization()) {
      svg = __classPrivateFieldGet18(this, _Renderer_instances, "m", _Renderer_randomizeIds).call(this, svg);
    }
    return svg;
  }
};
_Renderer_style = /* @__PURE__ */ new WeakMap(), _Renderer_resolver = /* @__PURE__ */ new WeakMap(), _Renderer_defs = /* @__PURE__ */ new WeakMap(), _Renderer_cachedSeedHash = /* @__PURE__ */ new WeakMap(), _Renderer_cachedInitials = /* @__PURE__ */ new WeakMap(), _Renderer_instances = /* @__PURE__ */ new WeakSet(), _Renderer_applyFlip = function _Renderer_applyFlip2(body, canvas) {
  const flip = __classPrivateFieldGet18(this, _Renderer_resolver, "f").flip();
  if (flip === "none") {
    return body;
  }
  const w = Number.format(canvas.width());
  const h = Number.format(canvas.height());
  let transform;
  switch (flip) {
    case "horizontal":
      transform = `translate(${w}, 0) scale(-1, 1)`;
      break;
    case "vertical":
      transform = `translate(0, ${h}) scale(1, -1)`;
      break;
    case "both":
      transform = `translate(${w}, ${h}) scale(-1, -1)`;
      break;
  }
  return `<g transform="${transform}">${body}</g>`;
}, _Renderer_applyScale = function _Renderer_applyScale2(body, canvas) {
  const scale = __classPrivateFieldGet18(this, _Renderer_resolver, "f").scale();
  if (scale === 1) {
    return body;
  }
  const cx = canvas.width() / 2;
  const cy = canvas.height() / 2;
  return `<g transform="translate(${Number.format(cx)}, ${Number.format(cy)}) scale(${Number.format(scale)}) translate(${Number.format(-cx)}, ${Number.format(-cy)})">${body}</g>`;
}, _Renderer_applyBorderRadius = function _Renderer_applyBorderRadius2(body, canvas) {
  const radius = __classPrivateFieldGet18(this, _Renderer_resolver, "f").borderRadius();
  const id = `clip-${__classPrivateFieldGet18(this, _Renderer_instances, "m", _Renderer_hashSeed).call(this)}`;
  const rx = Number.format(radius / 100 * canvas.width());
  const ry = Number.format(radius / 100 * canvas.height());
  __classPrivateFieldGet18(this, _Renderer_defs, "f").set(id, `<clipPath id="${id}"><rect width="${Number.format(canvas.width())}" height="${Number.format(canvas.height())}" rx="${rx}" ry="${ry}"/></clipPath>`);
  return `<g clip-path="url(#${id})">${body}</g>`;
}, _Renderer_applyRotate = function _Renderer_applyRotate2(body, canvas) {
  const rotate = __classPrivateFieldGet18(this, _Renderer_resolver, "f").rotate();
  if (rotate === 0) {
    return body;
  }
  const cx = canvas.width() / 2;
  const cy = canvas.height() / 2;
  return `<g transform="rotate(${Number.format(rotate)}, ${Number.format(cx)}, ${Number.format(cy)})">${body}</g>`;
}, _Renderer_applyTranslate = function _Renderer_applyTranslate2(body, canvas) {
  const tx = __classPrivateFieldGet18(this, _Renderer_resolver, "f").translateX();
  const ty = __classPrivateFieldGet18(this, _Renderer_resolver, "f").translateY();
  if (tx === 0 && ty === 0) {
    return body;
  }
  const x = Number.format(tx / 100 * canvas.width());
  const y = Number.format(ty / 100 * canvas.height());
  return `<g transform="translate(${x}, ${y})">${body}</g>`;
}, _Renderer_renderBackground = function _Renderer_renderBackground2(canvas) {
  const colors = __classPrivateFieldGet18(this, _Renderer_resolver, "f").color("background");
  if (colors.length === 0) {
    return "";
  }
  return `<rect width="${Number.format(canvas.width())}" height="${Number.format(canvas.height())}" fill="${Xml.escape(__classPrivateFieldGet18(this, _Renderer_instances, "m", _Renderer_resolveColorReference).call(this, "background"))}"/>`;
}, _Renderer_randomizeIds = function _Renderer_randomizeIds2(svg) {
  const suffix = Math.floor(Math.random() * 16777215).toString(16).padStart(6, "0");
  const ids = /* @__PURE__ */ new Set();
  for (const match of svg.matchAll(/\bid="([^"]+)"/g)) {
    ids.add(match[1]);
  }
  if (ids.size === 0) {
    return svg;
  }
  const escaped = Array.from(ids, (id) => id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const pattern = new RegExp(`(id="|url\\(#|href="#)(${escaped.join("|")})("|\\))`, "g");
  return svg.replace(pattern, (_, prefix, id, end) => `${prefix}${id}-${suffix}${end}`);
}, _Renderer_renderElements = function _Renderer_renderElements2(elements) {
  return elements.map((el) => __classPrivateFieldGet18(this, _Renderer_instances, "m", _Renderer_renderElement).call(this, el)).join("");
}, _Renderer_renderElement = function _Renderer_renderElement2(element) {
  switch (element.type()) {
    case "element":
      return __classPrivateFieldGet18(this, _Renderer_instances, "m", _Renderer_renderSvgElement).call(this, element);
    case "text":
      return __classPrivateFieldGet18(this, _Renderer_instances, "m", _Renderer_renderTextElement).call(this, element);
    case "component":
      return __classPrivateFieldGet18(this, _Renderer_instances, "m", _Renderer_renderComponentElement).call(this, element);
  }
}, _Renderer_renderSvgElement = function _Renderer_renderSvgElement2(element) {
  const name = element.name();
  if (!name) {
    return "";
  }
  if (name === "defs") {
    for (const child of element.children()) {
      const rendered = __classPrivateFieldGet18(this, _Renderer_instances, "m", _Renderer_renderElement).call(this, child);
      if (rendered.length > 0) {
        const id = child.attributes()?.id;
        const key = typeof id === "string" ? id : `_${__classPrivateFieldGet18(this, _Renderer_defs, "f").size}`;
        __classPrivateFieldGet18(this, _Renderer_defs, "f").set(key, rendered);
      }
    }
    return "";
  }
  const attrs = __classPrivateFieldGet18(this, _Renderer_instances, "m", _Renderer_renderAttributes).call(this, element.attributes());
  const children = __classPrivateFieldGet18(this, _Renderer_instances, "m", _Renderer_renderElements).call(this, element.children());
  if (children.length === 0) {
    return `<${name}${attrs}/>`;
  }
  return `<${name}${attrs}>${children}</${name}>`;
}, _Renderer_renderTextElement = function _Renderer_renderTextElement2(element) {
  const value = element.value();
  return value !== void 0 ? Xml.escape(__classPrivateFieldGet18(this, _Renderer_instances, "m", _Renderer_resolveValue).call(this, value)) : "";
}, _Renderer_renderComponentElement = function _Renderer_renderComponentElement2(element) {
  const componentName = element.name();
  if (typeof componentName !== "string") {
    return "";
  }
  const variantName = __classPrivateFieldGet18(this, _Renderer_resolver, "f").variant(componentName);
  if (!variantName) {
    return "";
  }
  const component = __classPrivateFieldGet18(this, _Renderer_style, "f").components().get(componentName);
  if (!component) {
    return "";
  }
  const variant = component.variants().get(variantName);
  if (!variant) {
    return "";
  }
  const id = `${component.sourceName()}-${variantName}-${__classPrivateFieldGet18(this, _Renderer_instances, "m", _Renderer_hashSeed).call(this)}`;
  if (!__classPrivateFieldGet18(this, _Renderer_defs, "f").has(id)) {
    const body = __classPrivateFieldGet18(this, _Renderer_instances, "m", _Renderer_renderElements).call(this, variant.elements());
    __classPrivateFieldGet18(this, _Renderer_defs, "f").set(id, `<g id="${id}">${body}</g>`);
  }
  const transforms = __classPrivateFieldGet18(this, _Renderer_instances, "m", _Renderer_buildTransforms).call(this, component);
  const userAttributes = element.attributes();
  let mergedAttributes = userAttributes;
  if (transforms.length > 0) {
    const userTransform = userAttributes?.transform;
    const allParts = typeof userTransform === "string" && userTransform.length > 0 ? [userTransform, ...transforms] : transforms;
    mergedAttributes = { ...userAttributes, transform: allParts.join(" ") };
  }
  const attrs = __classPrivateFieldGet18(this, _Renderer_instances, "m", _Renderer_renderAttributes).call(this, mergedAttributes);
  return `<use${attrs} href="#${id}"/>`;
}, _Renderer_buildTransforms = function _Renderer_buildTransforms2(component) {
  const { rotate, translateX, translateY, scale } = __classPrivateFieldGet18(this, _Renderer_resolver, "f").componentTransform(component.name());
  if (translateX === 0 && translateY === 0 && rotate === 0 && scale === 1) {
    return [];
  }
  const transforms = [];
  const cx = component.width() / 2;
  const cy = component.height() / 2;
  const cxValue = Number.format(cx);
  const cyValue = Number.format(cy);
  if (translateX !== 0 || translateY !== 0) {
    const x = Number.format(translateX / 100 * component.width());
    const y = Number.format(translateY / 100 * component.height());
    transforms.push(`translate(${x}, ${y})`);
  }
  if (rotate !== 0) {
    transforms.push(`rotate(${Number.format(rotate)}, ${cxValue}, ${cyValue})`);
  }
  if (scale !== 1) {
    transforms.push(`translate(${cxValue}, ${cyValue}) scale(${Number.format(scale)}) translate(${Number.format(-cx)}, ${Number.format(-cy)})`);
  }
  return transforms;
}, _Renderer_renderAttributes = function _Renderer_renderAttributes2(attributes) {
  if (!attributes) {
    return "";
  }
  const parts = [];
  for (const [key, value] of Object.entries(attributes)) {
    if (value === void 0) {
      continue;
    }
    parts.push(`${key}="${Xml.escape(__classPrivateFieldGet18(this, _Renderer_instances, "m", _Renderer_resolveAttributeValue).call(this, value))}"`);
  }
  if (parts.length === 0) {
    return "";
  }
  return ` ${parts.join(" ")}`;
}, _Renderer_resolveAttributeValue = function _Renderer_resolveAttributeValue2(value) {
  if (typeof value === "string") {
    return value;
  }
  if (value.type === "color") {
    return __classPrivateFieldGet18(this, _Renderer_instances, "m", _Renderer_resolveColorReference).call(this, value.name);
  }
  return __classPrivateFieldGet18(this, _Renderer_instances, "m", _Renderer_resolveVariable).call(this, value.name);
}, _Renderer_resolveColorReference = function _Renderer_resolveColorReference2(name) {
  const colors = __classPrivateFieldGet18(this, _Renderer_resolver, "f").color(name);
  const fill = __classPrivateFieldGet18(this, _Renderer_resolver, "f").colorFill(name);
  if (fill === "solid" || colors.length <= 1) {
    return colors[0] ?? "none";
  }
  return __classPrivateFieldGet18(this, _Renderer_instances, "m", _Renderer_buildGradientDef).call(this, name, colors, fill);
}, _Renderer_buildGradientDef = function _Renderer_buildGradientDef2(name, colors, fill) {
  const rotation = __classPrivateFieldGet18(this, _Renderer_resolver, "f").colorAngle(name);
  const id = `${name}-color-${__classPrivateFieldGet18(this, _Renderer_instances, "m", _Renderer_hashSeed).call(this)}`;
  const tag = fill === "linear" ? "linearGradient" : "radialGradient";
  const rotateAttr = rotation !== 0 ? ` gradientTransform="rotate(${Number.format(rotation)}, 0.5, 0.5)"` : "";
  const stops = colors.map((color, i) => {
    const offset = Number.format(i / (colors.length - 1) * 100);
    return `<stop offset="${offset}%" stop-color="${Xml.escape(color)}"/>`;
  });
  __classPrivateFieldGet18(this, _Renderer_defs, "f").set(id, `<${tag} id="${id}"${rotateAttr}>${stops.join("")}</${tag}>`);
  return `url(#${id})`;
}, _Renderer_resolveValue = function _Renderer_resolveValue2(value) {
  if (typeof value === "string") {
    return value;
  }
  if (value.type === "variable") {
    return __classPrivateFieldGet18(this, _Renderer_instances, "m", _Renderer_resolveVariable).call(this, value.name);
  }
  return "";
}, _Renderer_resolveVariable = function _Renderer_resolveVariable2(name) {
  switch (name) {
    case "initial": {
      const first = __classPrivateFieldGet18(this, _Renderer_instances, "m", _Renderer_initials).call(this).codePointAt(0);
      return first !== void 0 ? String.fromCodePoint(first) : "";
    }
    case "initials":
      return __classPrivateFieldGet18(this, _Renderer_instances, "m", _Renderer_initials).call(this);
    case "fontWeight":
      return Number.format(__classPrivateFieldGet18(this, _Renderer_resolver, "f").fontWeight());
    case "fontFamily":
      return __classPrivateFieldGet18(this, _Renderer_resolver, "f").fontFamily();
  }
}, _Renderer_initials = function _Renderer_initials2() {
  return __classPrivateFieldSet16(this, _Renderer_cachedInitials, __classPrivateFieldGet18(this, _Renderer_cachedInitials, "f") ?? Initials.fromSeed(__classPrivateFieldGet18(this, _Renderer_resolver, "f").seed()), "f");
}, _Renderer_hashSeed = function _Renderer_hashSeed2() {
  return __classPrivateFieldSet16(this, _Renderer_cachedSeedHash, __classPrivateFieldGet18(this, _Renderer_cachedSeedHash, "f") ?? Fnv1a.hex((__classPrivateFieldGet18(this, _Renderer_style, "f").meta().source().name() ?? "") + ":" + __classPrivateFieldGet18(this, _Renderer_resolver, "f").seed()), "f");
};

// node_modules/@dicebear/core/lib/Avatar.js
var __classPrivateFieldSet17 = function(receiver, state, value, kind, f) {
  if (kind === "m") throw new TypeError("Private method is not writable");
  if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a setter");
  if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
  return kind === "a" ? f.call(receiver, value) : f ? f.value = value : state.set(receiver, value), value;
};
var __classPrivateFieldGet19 = function(receiver, state, kind, f) {
  if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
  if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
  return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
};
var _Avatar_svg;
var _Avatar_resolvedOptions;
var definitionInputWarned = false;
var Avatar = class {
  /**
   * Pass a {@link Style} instance. Passing a raw style definition is
   * deprecated and will be removed in v11; wrap it with `new Style(...)` and
   * reuse the instance across avatars.
   */
  constructor(styleInput, optionsInput) {
    _Avatar_svg.set(this, void 0);
    _Avatar_resolvedOptions.set(this, void 0);
    if (!(styleInput instanceof Style) && !definitionInputWarned) {
      definitionInputWarned = true;
      console.warn("[DiceBear] Passing a style definition to `new Avatar()` is deprecated and will be removed in v11. Wrap it in a Style first: `new Avatar(new Style(definition), options)`.");
    }
    const style = styleInput instanceof Style ? styleInput : new Style(styleInput);
    const options = new Options(optionsInput);
    const resolver = new Resolver(style, options);
    __classPrivateFieldSet17(this, _Avatar_svg, new Renderer(style, resolver).render(), "f");
    __classPrivateFieldSet17(this, _Avatar_resolvedOptions, resolver.resolved(), "f");
  }
  /**
   * Returns the rendered SVG markup.
   */
  toString() {
    return __classPrivateFieldGet19(this, _Avatar_svg, "f");
  }
  /**
   * Returns the avatar as a JSON-serializable object containing the SVG and
   * the fully resolved options used to render it.
   */
  toJSON() {
    return {
      svg: __classPrivateFieldGet19(this, _Avatar_svg, "f"),
      options: structuredClone(__classPrivateFieldGet19(this, _Avatar_resolvedOptions, "f"))
    };
  }
  /**
   * Returns the SVG encoded as a `data:image/svg+xml` URI.
   */
  toDataUri() {
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(__classPrivateFieldGet19(this, _Avatar_svg, "f"))}`;
  }
};
_Avatar_svg = /* @__PURE__ */ new WeakMap(), _Avatar_resolvedOptions = /* @__PURE__ */ new WeakMap();

// node_modules/@dicebear/styles/dist/avataaars.min.json
var avataaars_min_default = { $id: "https://cdn.hopjs.net/npm/@dicebear/styles@10.4.0/dist/avataaars.min.json", $schema: "https://cdn.hopjs.net/npm/@dicebear/schema@1.3.0/dist/definition.min.json", $comment: "This file was generated by the DiceBear Exporter for Figma. https://www.figma.com/community/plugin/1005765655729342787", meta: { license: { name: "Free for personal and commercial use", url: "https://avataaars.com/", text: "Remix of \u201EAvataaars\u201D (https://avataaars.com/) by \u201EPablo Stanley\u201D, licensed under \u201EFree for personal and commercial use\u201D (https://avataaars.com/)" }, creator: { name: "Pablo Stanley", url: "https://twitter.com/pablostanley" }, source: { name: "Avataaars", url: "https://avataaars.com/" } }, canvas: { elements: [{ name: "path", type: "element", attributes: { d: "M140 36a56 56 0 0 0-56 56v6.17A12 12 0 0 0 74 110v14a12 12 0 0 0 10.3 11.88A56 56 0 0 0 116 180.6V199h-4a72 72 0 0 0-72 72v9h200v-9a72 72 0 0 0-72-72h-4v-18.38a56 56 0 0 0 31.7-44.73A12 12 0 0 0 206 124v-14a12 12 0 0 0-10-11.83V92a56 56 0 0 0-56-56", fill: { type: "color", name: "skin" } } }, { name: "path", type: "element", attributes: { d: "M116 180.61v8a56 56 0 0 0 24 5.39 56 56 0 0 0 24-5.39v-8a56 56 0 0 1-24 5.39 56 56 0 0 1-24-5.39", fill: "black", "fill-opacity": ".1" } }, { name: "clothes", type: "component", attributes: { transform: "translate(40 184.7)" } }, { name: "mouth", type: "component", attributes: { transform: "translate(94 140)" } }, { name: "nose", type: "component", attributes: { transform: "translate(128 130)" } }, { name: "eyes", type: "component", attributes: { transform: "translate(98 98)" } }, { name: "eyebrows", type: "component", attributes: { transform: "translate(91.86 82)" } }, { name: "top", type: "component", attributes: { transform: "translate(8)" } }, { name: "facialHair", type: "component", attributes: { transform: "translate(81 98)" } }, { name: "accessories", type: "component", attributes: { transform: "translate(75.77 46)" } }], width: 280, height: 280 }, attributes: { fill: "none", "shape-rendering": "auto" }, components: { accessories: { width: 130.47, height: 92.94, probability: 10, variants: { eyepatch: { elements: [{ name: "path", type: "element", attributes: { "fill-rule": "evenodd", "clip-rule": "evenodd", d: "M88.63.78c-3.08-3.09-6.28 3.86-7.77 5.65-3.61 4.32-7.09 8.75-10.76 13.02-7.25 8.43-14.43 16.92-21.63 25.4-1.1 1.28-.96 1.4-2.4 1.54-.95.08-2.27-.4-3.26-.46a29 29 0 0 0-8.14.9c-5.35 1.17-11.01 3.1-15.65 6.07-1.22.78-2 1.7-3.32 1.94-1.15.2-2.67-.21-3.84-.32-2.09-.2-5.09-1.05-7.13-.6-2.6.55-3.58 3.7-.94 5.08 2 1.06 6 .48 8.21.64 2.57.2 1.8.06 1.42 2.52-.52 3.54.35 7.49 1.84 10.72 3.46 7.5 13.04 15.46 21.77 14.72 7.28-.6 13.67-7.19 16.66-13.5a31 31 0 0 0 2.74-10.47c.2-2.27.1-4.67-.56-6.87a17 17 0 0 0-1.38-3.2c-.44-.8-2.4-2.64-2.52-3.44-.23-1.56 4.19-5.73 5.03-6.78Q63 36 68.92 28.6q5.82-7.33 11.77-14.52C82.5 11.9 91.54 3.7 88.6.78", fill: { type: "color", name: "accessories" } } }] }, kurt: { elements: [{ name: "path", type: "element", attributes: { d: "M65.23 54.11c-11.03 0-12.63-9.08-35.33-10.37C7.22 42.72.05 49.44 0 54.11c.05 4.3-1.12 15.45 13.6 28.52 14.77 15.51 29.9 10.25 35.33 5.18 5.44-2.34 11.64-23.35 16.3-23.33s10.87 21 16.3 23.33c5.43 5.07 20.57 10.33 35.34-5.18 14.72-13.07 13.55-24.23 13.59-28.52-.04-4.66-7.21-11.4-29.9-10.37-22.7 1.29-24.29 10.37-35.33 10.37", fill: "black", "fill-opacity": ".1" } }, { name: "path", type: "element", attributes: { d: "M65.23 52.11c-11.03 0-12.63-9.08-35.33-10.37C7.22 40.72.05 47.44 0 52.11c.05 4.3-1.12 15.45 13.6 28.52 14.77 15.51 29.9 10.25 35.33 5.18 5.44-2.34 11.64-23.35 16.3-23.33s10.87 21 16.3 23.33c5.43 5.07 20.57 10.33 35.34-5.18 14.72-13.07 13.55-24.23 13.59-28.52-.04-4.66-7.21-11.4-29.9-10.37-22.7 1.29-24.29 10.37-35.33 10.37", fill: { type: "color", name: "accessories" } } }, { name: "path", type: "element", attributes: { d: "M27.19 46.93c14.26-.29 27.55 7.9 27.17 15.55-.22 5.05-2.93 22.83-19.02 23.33-16.1.5-24.8-17.79-24.46-25.92.2-3.51 2.05-12.67 16.3-12.96m76.1 0c-14.26-.29-27.56 7.9-27.18 15.55.22 5.05 2.94 22.83 19.03 23.33s24.8-17.79 24.46-25.92c-.2-3.51-2.06-12.67-16.31-12.96", fill: "#2F383B" } }] }, prescription01: { elements: [{ name: "path", type: "element", attributes: { "fill-rule": "evenodd", "clip-rule": "evenodd", d: "M105.95 49.49c4.66.16 8 .88 10.54 4.52 3 .15 6.23.37 8.95 1.63 3.4 1.56 3.91 5.1-.36 5.6a20 20 0 0 1-5.55-.46l-.18-.03-.34-.06c1.1 9.46-6.2 20.87-14.23 24.35C93.83 89.8 81.57 84.53 75.77 75c-2.63-4.3-4.15-10.51-4.47-15.86q-.63-.31-1.23-.67-.57-.34-1.12-.61c-2-.98-5.34-1.1-7.5 0q-.51.26-1.04.58-.64.38-1.32.72C58.77 64.5 57.25 70.7 54.63 75c-5.8 9.53-18.07 14.8-29.04 10.04-8.06-3.48-15.37-14.9-14.26-24.35q-.18-.01-.34.03l-.19.03c-1.83.33-3.69.66-5.55.45-4.26-.5-3.74-4.03-.36-5.6 2.74-1.25 5.98-1.47 9-1.62 2.54-3.63 5.88-4.36 10.54-4.52l23.3-.46c5.18-.14 9.71 0 11.02 4.6a19 19 0 0 1 6.35-1.25c1.86 0 4.35.45 6.5 1.28 1.3-4.64 5.84-4.77 11.03-4.63zM81.9 56.27c-2.37.03-3.49.42-3.9 2.9-.4 2.5 0 5.31.48 7.78.72 3.77 1.92 7.46 4.7 10.22a16 16 0 0 0 8.32 4.34l.96.16c.63.1 1.23.18.72.13l-.1-.01h-.06.16c3.72.4 7.7.32 10.8-2.04 3.54-2.7 5.96-6.95 7.03-11.2.62-2.48 1.93-8.42-.46-10.4-2.74-2.28-28.64-1.88-28.64-1.88m-33.43 0c2.37.03 3.5.42 3.9 2.9.4 2.5 0 5.32-.46 7.78-.72 3.77-1.92 7.46-4.7 10.22a16 16 0 0 1-8.33 4.35l-.96.15c-.64.1-1.25.19-.68.13-3.73.4-7.74.32-10.84-2.05-3.54-2.7-5.96-6.95-7.02-11.2-.62-2.48-1.93-8.42.46-10.4 2.74-2.28 28.63-1.87 28.63-1.87m-10.93 25.5", fill: "black", "fill-opacity": ".1" } }, { name: "path", type: "element", attributes: { "fill-rule": "evenodd", "clip-rule": "evenodd", d: "M105.95 47.49c4.66.16 8 .88 10.54 4.52 3 .15 6.23.37 8.95 1.63 3.4 1.56 3.91 5.1-.36 5.6a20 20 0 0 1-5.55-.46l-.18-.03-.34-.06c1.1 9.46-6.2 20.87-14.23 24.35C93.83 87.8 81.57 82.53 75.77 73c-2.63-4.3-4.15-10.51-4.47-15.86q-.63-.31-1.23-.67-.57-.34-1.12-.61c-2-.98-5.34-1.1-7.5 0q-.51.26-1.04.58-.64.38-1.32.72C58.77 62.5 57.25 68.7 54.63 73c-5.8 9.53-18.07 14.8-29.04 10.04-8.06-3.48-15.37-14.9-14.26-24.35q-.18-.01-.34.03l-.19.03c-1.83.33-3.69.66-5.55.45-4.26-.5-3.74-4.03-.36-5.6 2.74-1.25 5.98-1.47 9-1.62 2.54-3.63 5.88-4.36 10.54-4.52l23.3-.46c5.18-.14 9.71 0 11.02 4.6a19 19 0 0 1 6.35-1.25c1.86 0 4.35.45 6.5 1.28 1.3-4.64 5.84-4.77 11.03-4.63zM81.9 54.27c-2.37.03-3.49.42-3.9 2.9-.4 2.5 0 5.31.48 7.78.72 3.77 1.92 7.46 4.7 10.22a16 16 0 0 0 8.32 4.34l.96.16c.63.1 1.23.18.72.13l-.1-.01h-.06.16c3.72.4 7.7.32 10.8-2.04 3.54-2.7 5.96-6.95 7.03-11.2.62-2.48 1.93-8.42-.46-10.4-2.74-2.28-28.64-1.88-28.64-1.88m-33.43 0c2.37.03 3.5.42 3.9 2.9.4 2.5 0 5.32-.46 7.78-.72 3.77-1.92 7.46-4.7 10.22a16 16 0 0 1-8.33 4.35l-.96.15c-.64.1-1.25.19-.68.13-3.73.4-7.74.32-10.84-2.05-3.54-2.7-5.96-6.95-7.02-11.2-.62-2.48-1.93-8.42.46-10.4 2.74-2.28 28.63-1.87 28.63-1.87m-10.93 25.5", fill: { type: "color", name: "accessories" } } }] }, prescription02: { elements: [{ name: "path", type: "element", attributes: { "fill-rule": "evenodd", "clip-rule": "evenodd", d: "M32.73 48C11.44 48 3.88 53.1 3.2 53.77a2.9 2.9 0 0 0-2.96 2.89v2.88c0 1.6 1.33 2.9 2.96 2.9 0 0 5.9 0 5.9 2.87q0 .65.19.68a63 63 0 0 0-.05 2.5c0 12.82 8.32 20.5 22.25 20.5h2.73c14.72 0 25-8.45 25-20.5q0-2.28-.17-4.48l1.59-.77q.86-.43 1.89-.64c1.85-.38 3.95-.22 5.99.28.73.18 1.26.35 1.5.45l1.38.55q-.2 2.26-.18 4.6c0 12.84 8.32 20.5 22.25 20.5h2.75c14.72 0 25-8.43 25-20.5q0-2.32-.17-4.56c1.73-1.5 6.22-1.5 6.22-1.5a2.9 2.9 0 0 0 2.95-2.9v-2.88c0-1.6-1.32-2.89-2.95-2.89-.7-.67-8.26-5.77-29.55-5.77h-2.97q-2.68 0-4.97.2c-9.54.53-14.68 2.14-19.92 4.7a17 17 0 0 1-4.56.86 17 17 0 0 1-4.8-.9l-.43-.2v-.02c-4.94-2.42-8.43-4.13-20.78-4.55a61 61 0 0 0-3.6-.1zm-19.5 21.5c0-8.66 0-15.5 19.39-15.5h3.23c19.38 0 19.38 6.84 19.38 15.5 0 9.13-8.63 15.5-21 15.5H31.2c-14.85 0-17.97-8.43-17.97-15.5m62 0c0-8.66 0-15.5 19.39-15.5h3.23c19.38 0 19.38 6.84 19.38 15.5 0 9.13-8.63 15.5-21 15.5H93.2c-14.85 0-17.97-8.43-17.97-15.5", fill: "black", "fill-opacity": ".1" } }, { name: "path", type: "element", attributes: { "fill-rule": "evenodd", "clip-rule": "evenodd", d: "M32.73 46C11.44 46 3.88 51.1 3.2 51.77a2.9 2.9 0 0 0-2.96 2.89v2.88c0 1.6 1.33 2.9 2.96 2.9 0 0 5.9 0 5.9 2.87q0 .67.19.71a63 63 0 0 0-.05 2.51c0 12.83 8.32 20.5 22.25 20.5h2.73c14.72 0 25-8.44 25-20.5q0-2.27-.17-4.47l1.59-.77q.86-.43 1.89-.64c1.85-.38 3.95-.22 5.99.28.73.18 1.26.35 1.5.45l1.38.55q-.2 2.26-.18 4.6c0 12.85 8.32 20.51 22.25 20.51h2.75c14.72 0 25-8.43 25-20.5q0-2.32-.17-4.56c1.73-1.51 6.22-1.51 6.22-1.51a2.9 2.9 0 0 0 2.95-2.89V54.7c0-1.6-1.32-2.89-2.95-2.89-.7-.67-8.26-5.77-29.55-5.77h-2.97q-2.68 0-4.97.2c-9.54.54-14.68 2.15-19.92 4.7a17 17 0 0 1-4.56.87 17 17 0 0 1-4.8-.9l-.43-.2c-4.94-2.44-8.43-4.15-20.78-4.57a61 61 0 0 0-3.6-.1zm-19.5 21.5c0-8.66 0-15.5 19.39-15.5h3.23c19.38 0 19.38 6.84 19.38 15.5 0 9.13-8.63 15.5-21 15.5H31.2c-14.85 0-17.97-8.43-17.97-15.5m62 0c0-8.66 0-15.5 19.39-15.5h3.23c19.38 0 19.38 6.84 19.38 15.5 0 9.13-8.63 15.5-21 15.5H93.2c-14.85 0-17.97-8.43-17.97-15.5", fill: { type: "color", name: "accessories" } } }] }, round: { elements: [{ name: "path", type: "element", attributes: { "fill-rule": "evenodd", "clip-rule": "evenodd", d: "M34.23 92a24 24 0 0 1-22.96-31H4.73a2.5 2.5 0 0 1 0-5h8q.34 0 .66.09a24 24 0 0 1 42.26 1.06A11.4 11.4 0 0 1 65.1 52c4 0 7.54 2.14 9.6 5.4a24 24 0 0 1 42.37-1.31q.31-.1.66-.1h8a2.5 2.5 0 1 1 0 5h-6.53a24 24 0 1 1-46.6 2.84c-.1-4.37-3.45-7.83-7.5-7.83-3.74 0-6.9 2.94-7.43 6.83q.56 2.51.56 5.17a24 24 0 0 1-24 24m0-4a20 20 0 1 0 0-40 20 20 0 0 0 0 40m82-20a20 20 0 1 1-40 0 20 20 0 0 1 40 0", fill: "black", "fill-opacity": ".1" } }, { name: "path", type: "element", attributes: { "fill-rule": "evenodd", "clip-rule": "evenodd", d: "M34.23 90a24 24 0 0 1-22.96-31H4.73a2.5 2.5 0 0 1 0-5h8q.34 0 .66.09a24 24 0 0 1 42.26 1.06A11.4 11.4 0 0 1 65.1 50c4 0 7.54 2.14 9.6 5.4a24 24 0 0 1 42.37-1.31q.31-.1.66-.1h8a2.5 2.5 0 1 1 0 5h-6.53a24 24 0 1 1-46.6 2.84c-.1-4.37-3.45-7.83-7.5-7.83-3.74 0-6.9 2.94-7.43 6.83q.56 2.51.56 5.17a24 24 0 0 1-24 24m0-4a20 20 0 1 0 0-40 20 20 0 0 0 0 40m82-20a20 20 0 1 1-40 0 20 20 0 0 1 40 0", fill: { type: "color", name: "accessories" } } }] }, sunglasses: { elements: [{ name: "path", type: "element", attributes: { "fill-rule": "evenodd", "clip-rule": "evenodd", d: "M105.95 49.49c4.66.16 8 .88 10.54 4.52 3 .15 6.22.37 8.94 1.63 3.4 1.56 3.91 5.1-.36 5.6a20 20 0 0 1-5.55-.46l-.18-.03-.34-.06c1.11 9.46-6.19 20.87-14.22 24.35C93.83 89.8 81.57 84.53 75.77 75c-2.63-4.3-4.15-10.51-4.47-15.86q-.63-.31-1.23-.67-.57-.34-1.12-.61c-2-.98-5.34-1.1-7.5 0q-.51.26-1.04.58-.64.38-1.32.72C58.77 64.5 57.25 70.7 54.63 75c-5.8 9.53-18.07 14.8-29.04 10.04-8.07-3.48-15.38-14.9-14.27-24.35q-.18-.02-.34.02l-.19.03c-1.83.33-3.69.66-5.55.45-4.26-.5-3.74-4.03-.36-5.6 2.74-1.25 5.98-1.47 9-1.62 2.54-3.63 5.88-4.36 10.54-4.52l23.3-.46c5.18-.14 9.71 0 11.02 4.6a19 19 0 0 1 6.35-1.25c1.86 0 4.35.45 6.5 1.28 1.3-4.64 5.84-4.77 11.03-4.63zM81.9 56.27c-2.37.03-3.49.42-3.9 2.9-.4 2.5 0 5.31.48 7.78.72 3.77 1.92 7.46 4.7 10.22a16 16 0 0 0 8.32 4.34l.96.16c.63.1 1.23.18.72.13 3.72.4 7.7.3 10.8-2.05 3.54-2.7 5.96-6.95 7.03-11.2.62-2.48 1.93-8.42-.46-10.4-2.74-2.28-28.64-1.88-28.64-1.88m-33.43 0c2.37.03 3.5.42 3.9 2.9.4 2.5 0 5.32-.46 7.78-.72 3.77-1.92 7.46-4.7 10.22a16.2 16.2 0 0 1-9.3 4.5c-.63.1-1.24.19-.67.13-3.73.4-7.74.32-10.84-2.05-3.54-2.7-5.96-6.95-7.02-11.2-.62-2.48-1.93-8.42.46-10.4 2.74-2.28 28.63-1.87 28.63-1.87m-10.93 25.5", fill: "black", "fill-opacity": ".1" } }, { name: "path", type: "element", attributes: { "fill-rule": "evenodd", "clip-rule": "evenodd", d: "M49.24 53.28c2.51.02 3.7.45 4.13 3.11.43 2.7.01 5.74-.49 8.4-.76 4.06-2.03 8.04-4.98 11a17 17 0 0 1-8.8 4.69c-.34.07-3.16.47-1.43.27-4.04.47-8.42.45-11.8-2.17-3.74-2.9-6.3-7.5-7.43-12.07-.66-2.63-2.04-9.03.5-11.2 2.9-2.42 30.3-2 30.3-2", fill: "black", "fill-opacity": ".7" } }, { name: "path", type: "element", attributes: { "fill-rule": "evenodd", "clip-rule": "evenodd", d: "M49.24 53.28c2.51.02 3.7.45 4.13 3.11.43 2.7.01 5.74-.49 8.4-.76 4.06-2.03 8.04-4.98 11a17 17 0 0 1-8.8 4.69c-.34.07-3.16.47-1.43.27-4.04.47-8.42.45-11.8-2.17-3.74-2.9-6.3-7.5-7.43-12.07-.66-2.63-2.04-9.03.5-11.2 2.9-2.42 30.3-2 30.3-2", fill: "url(#accessoriesSunglasses-a)", style: "mix-blend-mode:screen" } }, { name: "path", type: "element", attributes: { "fill-rule": "evenodd", "clip-rule": "evenodd", d: "M81.15 53.27c-2.5.03-3.7.45-4.12 3.12-.44 2.7-.02 5.73.48 8.4.77 4.06 2.04 8.03 4.99 11a17 17 0 0 0 8.8 4.69c.33.07 3.16.47 1.42.26 4.05.47 8.43.45 11.8-2.16 3.74-2.9 6.3-7.5 7.43-12.07.66-2.64 2.05-9.04-.48-11.17-2.9-2.46-30.32-2.03-30.32-2.03", fill: "black", "fill-opacity": ".7" } }, { name: "path", type: "element", attributes: { "fill-rule": "evenodd", "clip-rule": "evenodd", d: "M81.15 53.27c-2.5.03-3.7.45-4.12 3.12-.44 2.7-.02 5.73.48 8.4.77 4.06 2.04 8.03 4.99 11a17 17 0 0 0 8.8 4.69c.33.07 3.16.47 1.42.26 4.05.47 8.43.45 11.8-2.16 3.74-2.9 6.3-7.5 7.43-12.07.66-2.64 2.05-9.04-.48-11.17-2.9-2.46-30.32-2.03-30.32-2.03", fill: "url(#accessoriesSunglasses-b)", style: "mix-blend-mode:screen" } }, { name: "path", type: "element", attributes: { "fill-rule": "evenodd", "clip-rule": "evenodd", d: "M105.95 47.49c4.66.16 8 .88 10.54 4.52 3 .15 6.22.37 8.94 1.63 3.4 1.56 3.91 5.1-.36 5.6a20 20 0 0 1-5.55-.46l-.18-.03-.34-.06c1.11 9.46-6.19 20.87-14.22 24.35C93.83 87.8 81.57 82.53 75.77 73c-2.63-4.3-4.15-10.51-4.47-15.86q-.63-.31-1.23-.67-.57-.34-1.12-.61c-2-.98-5.34-1.1-7.5 0q-.51.26-1.04.58-.64.38-1.32.72C58.77 62.5 57.25 68.7 54.63 73c-5.8 9.53-18.07 14.8-29.04 10.04-8.07-3.48-15.38-14.9-14.27-24.35q-.18-.02-.34.02l-.19.03c-1.83.33-3.69.66-5.55.45-4.26-.5-3.74-4.03-.36-5.6 2.74-1.25 5.98-1.47 9-1.62 2.54-3.63 5.88-4.36 10.54-4.52l23.3-.46c5.18-.14 9.71 0 11.02 4.6a19 19 0 0 1 6.35-1.25c1.86 0 4.35.45 6.5 1.28 1.3-4.64 5.84-4.77 11.03-4.63zM81.9 54.27c-2.37.03-3.49.42-3.9 2.9-.4 2.5 0 5.31.48 7.78.72 3.77 1.92 7.46 4.7 10.22a16 16 0 0 0 8.32 4.34l.96.16c.63.1 1.23.18.72.13 3.72.4 7.7.3 10.8-2.05 3.54-2.7 5.96-6.95 7.03-11.2.62-2.48 1.93-8.42-.46-10.4-2.74-2.28-28.64-1.88-28.64-1.88m-33.43 0c2.37.03 3.5.42 3.9 2.9.4 2.5 0 5.32-.46 7.78-.72 3.77-1.92 7.46-4.7 10.22a16.2 16.2 0 0 1-9.3 4.5c-.63.1-1.24.19-.67.13-3.73.4-7.74.32-10.84-2.05-3.54-2.7-5.96-6.95-7.02-11.2-.62-2.48-1.93-8.42.46-10.4 2.74-2.28 28.63-1.87 28.63-1.87m-10.93 25.5", fill: { type: "color", name: "accessories" } } }, { name: "defs", type: "element", children: [{ name: "linearGradient", type: "element", attributes: { id: "accessoriesSunglasses-a", x1: "22.79", y1: "53.25", x2: "22.79", y2: "72.8", gradientUnits: "userSpaceOnUse" }, children: [{ name: "stop", type: "element", attributes: { "stop-color": "white", "stop-opacity": ".5" } }, { name: "stop", type: "element", attributes: { offset: "1", "stop-opacity": ".5" } }] }, { name: "linearGradient", type: "element", attributes: { id: "accessoriesSunglasses-b", x1: "76.85", y1: "53.25", x2: "76.85", y2: "80.98", gradientUnits: "userSpaceOnUse" }, children: [{ name: "stop", type: "element", attributes: { "stop-color": "white", "stop-opacity": ".5" } }, { name: "stop", type: "element", attributes: { offset: ".71", "stop-opacity": ".5" } }] }] }] }, wayfarers: { elements: [{ name: "path", type: "element", attributes: { "fill-rule": "evenodd", "clip-rule": "evenodd", d: "M33.48 48c-21.12 0-28.63 5.17-29.32 5.86a2.93 2.93 0 0 0-2.93 2.93v2.92a2.93 2.93 0 0 0 2.93 2.93s5.87 0 5.87 2.93q0 .3.03.45-.04 1.23-.04 2.48c0 12.84 8.3 20.5 22.18 20.5h2.75c14.68 0 24.93-8.43 24.93-20.5q0-2.17-.15-4.28l1.45-.73q.86-.42 1.88-.64a13.4 13.4 0 0 1 5.94.28q1.1.3 1.5.46l1.25.5a51 51 0 0 0-.16 4.4c0 12.81 8.29 20.5 22.18 20.5h2.75c14.68 0 24.93-8.46 24.93-20.5q0-1.28-.05-2.5.03-.18.04-.46c0-2.93 5.86-2.93 5.86-2.93 1.62 0 2.93-1.3 2.93-2.93v-2.9a2.93 2.93 0 0 0-2.93-2.93c-.69-.69-8.19-5.86-29.32-5.86h-2.93q-2.74 0-5.08.21c-9.38.56-14.46 2.2-19.63 4.76-.54.2-2.38.8-4.53.88a17 17 0 0 1-4.77-.92l-.42-.2c-4.9-2.46-8.35-4.19-20.55-4.62q-1.73-.1-3.66-.1zm-1.11 5.86h1.11q3.66 0 6.48.1C54 54.8 54 60.91 54 68.5c0 8.62-7.84 14.64-19.06 14.64H32.2c-13.49 0-16.32-7.96-16.32-14.64 0-8 0-14.37 16.5-14.64m26.1 4.36.1.03-.08.03zm14.51 0-.07.03.05.02zm16.7-4.12a125 125 0 0 1 9.41-.24c16.48.27 16.48 6.63 16.48 14.64 0 8.62-7.84 14.64-19.06 14.64h-2.75c-13.49 0-16.32-7.96-16.32-14.64 0-7.25 0-13.15 12.24-14.4", fill: "black", "fill-opacity": ".1" } }, { name: "path", type: "element", attributes: { d: "M34.95 84.07c13.75 0 22-7.87 22-17.57s-1.3-17.57-20.55-17.57h-2.93c-19.24 0-20.53 7.86-20.53 17.57 0 9.7 5.5 17.57 19.25 17.57z", fill: "black", "fill-opacity": ".7" } }, { name: "path", type: "element", attributes: { d: "M34.95 84.07c13.75 0 22-7.87 22-17.57s-1.3-17.57-20.55-17.57h-2.93c-19.24 0-20.53 7.86-20.53 17.57 0 9.7 5.5 17.57 19.25 17.57z", fill: "url(#accessoriesWayfarers-a)", style: "mix-blend-mode:screen" } }, { name: "path", type: "element", attributes: { d: "M96.52 84.07c13.75 0 22-7.87 22-17.57s-1.3-17.57-20.54-17.57h-2.93c-19.25 0-20.53 7.86-20.53 17.57 0 9.7 5.5 17.57 19.25 17.57z", fill: "black", "fill-opacity": ".7" } }, { name: "path", type: "element", attributes: { d: "M96.52 84.07c13.75 0 22-7.87 22-17.57s-1.3-17.57-20.54-17.57h-2.93c-19.25 0-20.53 7.86-20.53 17.57 0 9.7 5.5 17.57 19.25 17.57z", fill: "url(#accessoriesWayfarers-b)", style: "mix-blend-mode:screen" } }, { name: "path", type: "element", attributes: { "fill-rule": "evenodd", "clip-rule": "evenodd", d: "M33.48 46c-21.12 0-28.63 5.17-29.32 5.86a2.93 2.93 0 0 0-2.93 2.93v2.92a2.93 2.93 0 0 0 2.93 2.93s5.87 0 5.87 2.93q0 .3.03.45-.04 1.23-.04 2.48c0 12.84 8.3 20.5 22.18 20.5h2.75c14.68 0 24.93-8.43 24.93-20.5q0-2.17-.15-4.28l1.45-.73q.86-.42 1.88-.64a13.4 13.4 0 0 1 5.94.28q1.1.29 1.5.46l1.25.5a51 51 0 0 0-.16 4.4c0 12.81 8.29 20.5 22.18 20.5h2.75c14.68 0 24.93-8.46 24.93-20.5q0-1.28-.05-2.5.03-.17.04-.46c0-2.93 5.86-2.93 5.86-2.93 1.62 0 2.93-1.3 2.93-2.93v-2.9a2.93 2.93 0 0 0-2.93-2.93c-.69-.69-8.19-5.86-29.32-5.86h-2.93q-2.74 0-5.08.21c-9.38.56-14.46 2.2-19.63 4.76-.54.2-2.38.8-4.53.88a17 17 0 0 1-4.77-.92l-.42-.2c-4.9-2.46-8.35-4.19-20.55-4.62q-1.73-.1-3.66-.1zm-1.11 5.86h1.11q3.66 0 6.48.1C54 52.8 54 58.91 54 66.5c0 8.62-7.84 14.64-19.06 14.64H32.2c-13.49 0-16.32-7.96-16.32-14.64 0-8 0-14.37 16.5-14.64m26.1 4.36.1.03-.08.03zm14.51 0-.07.03.05.02zm16.7-4.12a125 125 0 0 1 9.41-.24c16.48.27 16.48 6.63 16.48 14.64 0 8.62-7.84 14.64-19.06 14.64h-2.75c-13.49 0-16.32-7.96-16.32-14.64 0-7.25 0-13.15 12.24-14.4", fill: { type: "color", name: "accessories" } } }, { name: "defs", type: "element", children: [{ name: "linearGradient", type: "element", attributes: { id: "accessoriesWayfarers-a", x1: "74.52", y1: "48.93", x2: "74.52", y2: "84.07", gradientUnits: "userSpaceOnUse" }, children: [{ name: "stop", type: "element", attributes: { "stop-color": "white", "stop-opacity": ".5" } }, { name: "stop", type: "element", attributes: { offset: ".71", "stop-opacity": ".5" } }] }, { name: "linearGradient", type: "element", attributes: { id: "accessoriesWayfarers-b", x1: "74.52", y1: "48.93", x2: "74.52", y2: "84.07", gradientUnits: "userSpaceOnUse" }, children: [{ name: "stop", type: "element", attributes: { "stop-color": "white", "stop-opacity": ".5" } }, { name: "stop", type: "element", attributes: { offset: ".71", "stop-opacity": ".5" } }] }] }] } } }, clothes: { width: 200, height: 95.31, variants: { blazerAndShirt: { elements: [{ name: "path", type: "element", attributes: { d: "M100.5 37.13c18.5 0 33.5-9.61 33.5-21.48q0-.52-.04-1.05A72 72 0 0 1 200 86.36v8.95H0v-8.95a72 72 0 0 1 67.05-71.83q-.05.55-.05 1.12c0 11.87 15 21.48 33.5 21.48", fill: "#E6E6E6" } }, { name: "path", type: "element", attributes: { d: "M100.5 44.07c21.89 0 39.63-12.05 39.63-26.92q0-.9-.08-1.79-3-.51-6.1-.76.06.52.05 1.05c0 11.87-15 21.48-33.5 21.48S67 27.52 67 15.65q0-.57.05-1.12-3.08.2-6.08.67-.1.97-.1 1.95c0 14.87 17.74 26.92 39.63 26.92", fill: "black", "fill-opacity": ".16" } }, { name: "path", type: "element", attributes: { d: "M68.78 14.43 69 13.3c-2.96.06-6 1-6 1l-.42.67A72 72 0 0 0 0 86.36v8.95h74s-10.7-51.56-5.24-80.8zM126 95.3s11-53 5-82c2.96.06 6 1 6 1l.42.67A72 72 0 0 1 200 86.36v8.95z", fill: { type: "color", name: "clothes" } } }, { name: "path", type: "element", attributes: { "fill-rule": "evenodd", "clip-rule": "evenodd", d: "M69 13.3c-6 29 5 82 5 82H58l-14-36 6-9-6-6 19-30s3.04-.94 6-1m62 0c6 29-5 82-5 82h16l14-36-6-9 6-6-19-30s-3.04-.94-6-1", fill: "black", "fill-opacity": ".15" } }, { name: "path", type: "element", attributes: { d: "m151.42 71.07.87-2.24 6.27-4.7a4 4 0 0 1 4.85.05l6.6 5.13z", fill: "#E6E6E6" } }] }, blazerAndSweater: { elements: [{ name: "path", type: "element", attributes: { d: "M100 42.36c14.91 0 27-11.2 27-25q0-1.53-.2-3h1.2a72 72 0 0 1 72 72v8.95H0v-8.95a72 72 0 0 1 72-72h1.2q-.2 1.47-.2 3c0 13.8 12.09 25 27 25", fill: "#E6E6E6" } }, { name: "path", type: "element", attributes: { d: "M68.78 14.43 69 13.3c-2.96.06-6 1-6 1l-.42.67A72 72 0 0 0 0 86.36v8.95h74s-10.7-51.56-5.24-80.8zM126 95.3s11-53 5-82c2.96.06 6 1 6 1l.42.67A72 72 0 0 1 200 86.36v8.95z", fill: { type: "color", name: "clothes" } } }, { name: "path", type: "element", attributes: { "fill-rule": "evenodd", "clip-rule": "evenodd", d: "M69 13.3c-6 29 5 82 5 82H58l-14-36 6-9-6-6 19-30s3.04-.94 6-1m62 0c6 29-5 82-5 82h16l14-36-6-9 6-6-19-30s-3.04-.94-6-1", fill: "black", "fill-opacity": ".15" } }, { name: "path", type: "element", attributes: { d: "M76 6.84c-6.77 4.6-11 11.12-11 18.35 0 7.4 4.43 14.06 11.48 18.67l5.94-4.68 4.58.33-1-3.15.08-.06C79.98 33.16 76 28 76 22.18zm48 15.34c0 5.83-3.98 10.98-10.08 14.12l.08.06-1 3.15 4.58-.33 5.94 4.68C130.57 39.26 135 32.6 135 25.2c0-7.23-4.23-13.75-11-18.35z", fill: "#F2F2F2" } }, { name: "path", type: "element", attributes: { d: "m151.42 71.07.87-2.24 6.27-4.7a4 4 0 0 1 4.85.05l6.6 5.13z", fill: "#E6E6E6" } }] }, collarAndSweater: { elements: [{ name: "path", type: "element", attributes: { d: "M68.37 14.45A28 28 0 0 1 76 6.88v15.3C76 28 79.98 33.16 86.08 36.3l-.08.06.9 2.87c3.89 2 8.35 3.13 13.1 3.13s9.21-1.14 13.1-3.13l.9-2.87-.08-.06C120.02 33.16 124 28 124 22.18V7.58a27 27 0 0 1 6.6 6.82A72 72 0 0 1 200 86.36v8.95H0v-8.95a72 72 0 0 1 68.37-71.91", fill: { type: "color", name: "clothes" } } }, { name: "path", type: "element", attributes: { d: "M76 6.88c-6.77 4.6-11 11.17-11 18.45 0 7.4 4.36 14.06 11.3 18.67l6.12-4.82 4.58.33-1-3.15.08-.06C79.98 33.16 76 28 76 22.18zm48 15.3c0 5.83-3.98 10.98-10.08 14.12l.08.06-1 3.15 4.58-.33 5.65 4.45c6.63-4.6 10.77-11.1 10.77-18.3 0-6.92-3.82-13.19-10-17.74z", fill: "white", "fill-opacity": ".75" } }] }, graphicShirt: { elements: [{ name: "path", type: "element", attributes: { d: "M100.5 39.3c18.5 0 33.5-9.62 33.5-21.5q0-1.64-.38-3.23A72 72 0 0 1 200 86.36v8.95H0v-8.95A72 72 0 0 1 67.4 14.5a14 14 0 0 0-.4 3.3c0 11.88 15 21.5 33.5 21.5", fill: { type: "color", name: "clothes" } } }, { name: "clothesGraphic", type: "component", attributes: { transform: "translate(45 44.3)" } }] }, hoodie: { elements: [{ name: "path", type: "element", attributes: { d: "M76 0C60.48 3.7 48.9 10.83 45.23 19.45A72 72 0 0 0 0 86.3v9h200v-9a72 72 0 0 0-45.23-66.86C151.1 10.83 139.52 3.69 124 0v17.3a24 24 0 1 1-48 0z", fill: { type: "color", name: "clothes" } } }, { name: "path", type: "element", attributes: { d: "M70 48.64a67 67 0 0 1-7-2.81V95.3h7zm60 0a67 67 0 0 0 7-2.81V83.8a3.5 3.5 0 1 1-7 0z", fill: "#F4F4F4" } }, { name: "path", type: "element", attributes: { d: "M155.62 19.8a72 72 0 0 1 10.83 5.62c-1.34 15.5-30.58 27.89-66.45 27.89 30.93 0 56-13.44 56-30q0-1.79-.38-3.52m-111.24.01a17 17 0 0 0-.38 3.5c0 16.57 25.07 30 56 30-35.87 0-65.1-12.38-66.45-27.88a72 72 0 0 1 10.83-5.63", fill: "black", "fill-opacity": ".16" } }] }, overall: { elements: [{ name: "path", type: "element", attributes: { d: "M164 23.94V95.3H36V23.94a72 72 0 0 1 26-8.95v44.28h76V15a72 72 0 0 1 26 8.94", fill: { type: "color", name: "clothes" } } }, { name: "path", type: "element", attributes: { d: "M54 68.3a5 5 0 1 1-10 0 5 5 0 0 1 10 0m102 0a5 5 0 1 1-10 0 5 5 0 0 1 10 0", fill: "#F4F4F4" } }] }, shirtCrewNeck: { elements: [{ name: "path", type: "element", attributes: { d: "M100.5 37.13c18.5 0 33.5-9.61 33.5-21.48q0-.52-.04-1.05A72 72 0 0 1 200 86.36v8.95H0v-8.95a72 72 0 0 1 67.05-71.83q-.05.55-.05 1.12c0 11.87 15 21.48 33.5 21.48", fill: { type: "color", name: "clothes" } } }, { name: "path", type: "element", attributes: { d: "M100.5 44.07c21.89 0 39.63-12.05 39.63-26.92q0-.9-.08-1.79-3-.52-6.1-.76.06.52.05 1.05c0 11.87-15 21.48-33.5 21.48S67 27.52 67 15.65q0-.57.05-1.13-3.08.21-6.08.68-.1.97-.1 1.95c0 14.87 17.74 26.92 39.63 26.92", fill: "black", "fill-opacity": ".08" } }] }, shirtScoopNeck: { elements: [{ name: "path", type: "element", attributes: { d: "M100.5 51.13c27.34 0 49.5-13.2 49.5-29.48q0-2.04-.46-4A72 72 0 0 1 200 86.35v8.95H0v-8.95A72 72 0 0 1 51.53 17.3a18 18 0 0 0-.53 4.34c0 16.28 22.16 29.48 49.5 29.48", fill: { type: "color", name: "clothes" } } }] }, shirtVNeck: { elements: [{ name: "path", type: "element", attributes: { d: "M60.68 15.24A72 72 0 0 0 0 86.36v8.95h200v-8.95a72 72 0 0 0-60.68-71.12 24 24 0 0 1-7.56 13.6l-29.08 26.23a4 4 0 0 1-5.36 0L68.24 28.84a24 24 0 0 1-7.56-13.6", fill: { type: "color", name: "clothes" } } }] } } }, clothesGraphic: { width: 109.68, height: 42, variants: { bat: { elements: [{ name: "path", type: "element", attributes: { "fill-rule": "evenodd", "clip-rule": "evenodd", d: "M87.69 12.4c-1.4-6.43-6.2-10.15-12.5-11.58-2.53-.58-10.92-2.4-9.61 2.4.6 2.18.26 3.97-1.55 5.77-1.77 1.76-5.24 2.2-6.96-.01-1.47-1.9.43-4.72-.72-6.57-.44-.71-1.21-1.08-2.03-.73-1.14.5-.53 1.56-1.07 2.32-.85 1.2-1.24.83-2-.37-.49-.76-.02-1.58-1.26-1.9-1.43-.37-1.9.83-2.03 1.92-.08.69.32 1.8.34 2.5.03 1.35-.1 3.31-.73 4.52-1.12 2.14-2.7 1.45-4.38.1-1.98-1.6-2.56-3.39-2.18-5.82.46-2.92.3-5.71-3.28-3.9a33.5 33.5 0 0 0-12.59 11.93c-2.44 4.02-4.36 8.9-2.2 13.48 2.21 4.67 5.86 8.69 10.97 9.88 1.32.3 5.1 1.81 6.34.55 1.95-1.96-2.54-3.78-3.43-4.97-1.26-1.7-2.34-4.92-.96-6.83 1.76-2.48 3.6-1.1 5.05.6 1.13 1.34 2.75 4.81 4.5 2.01 1.21-1.93 1.1-5.1 4.4-3.72 4.78 1.97 4.9 11.11 5.76 15.3.37 1.81 2.04 4.05 3.47 1.51.8-1.39.37-4.4.22-5.85-.3-2.99-1.08-5.92-.1-8.88.55-1.7 2-4.16 4.12-2.84 1.73 1.06 1 5.81 3.35 5.8 2.07 0 1.5-3.79 2.6-5.04 1.69-1.9 4.92-1 5.92 1.24 1.33 3.03-2.2 5.13-2.05 7.8.16 2.58 3.5 1.57 4.9.91 2.86-1.35 5.09-3.85 6.66-6.57 2.4-4.19 4.13-10.2 3.08-15.02", fill: "white" } }] }, bear: { elements: [{ name: "path", type: "element", attributes: { "fill-rule": "evenodd", "clip-rule": "evenodd", d: "M76.74 16.44a17 17 0 0 1 2.15 7.86v.22c-.1 10.22-13.6 16.85-22.48 17.35q-.95.05-1.89.05h-.01c-10.08 0-19.56-4.55-22.54-14.85a14 14 0 0 1-.52-3.81c0-3.36 1.12-6.83 3.15-9.4q.38-.45.83-.88c.37-.36.74-.72 1-1.1.47-.71.64-.7.67-.75.02-.04-.09-.15-.18-.98-.06-.5-.22-.93-.38-1.37a5 5 0 0 1-.41-1.88c.05-2.4 1.76-5.08 4.05-5.95a6 6 0 0 1 3.96.08c.6.2 1.18.67 1.75 1.13s1.13.9 1.64 1.04c.97.24 2.83-.14 4.47-.47.96-.2 1.84-.38 2.44-.4a34 34 0 0 1 4.2-.04c.27.01.72.11 1.2.23.84.2 1.8.4 2.23.27.45-.13.92-.5 1.4-.9s.98-.85 1.5-1a9 9 0 0 1 3.2-.48c2.34.13 5 1.18 6 3.42.8 1.8.24 3.3-.34 4.87q-.31.8-.55 1.62c-.2.7-.31.85-.3.96.03.12.2.21.55.83.07.13.34.44.6.74l.42.48c.8.97 1.57 2 2.19 3.08M58.3 35.97c3.07 2.96 6.67-1.57 7.15-4.38.84-10.07-15.07-8.75-19.23-3-2.1 2.9-.61 6.8 2.58 8.2 1.4.62 2.58.92 3.58-.04.8-.76 1.03-3.52.5-4.27-.3-.39-.67-.5-1.05-.6-.55-.16-1.1-.32-1.35-1.29-.57-2.17 1.8-2.5 3.3-2.62l.97-.1c1.69-.2 4.05-.48 5.03.5 1.3 1.33.26 2.35-.83 3.42-1.21 1.18-2.47 2.42-.65 4.18M48.72 15.5c-.59-.97-1.75-1.21-2.73-.77-1.82.83-.96 3.52.75 3.75 1.62.2 2.78-1.6 1.98-2.96m15.23.88c-.86 3-5.64-.38-2.94-2.3 1.55-1.1 3.45.5 2.94 2.3", fill: "white" } }] }, cumbia: { elements: [{ name: "path", type: "element", attributes: { "fill-rule": "evenodd", "clip-rule": "evenodd", d: "M10.27 29.13c3.28-.56 5.73-3.55 5.18-6.79-.46-2.72-1.74-.34-2.97.86-1.34 1.3-2.45 2.57-4.54 2.05-3.6-.9-4.86-5.4-3.84-8.48a6 6 0 0 1 3.48-3.7c1.85-.74 3.2.1 4.75 1.1.28.19 1.73 1.37 2 1.25.45-.21.1-2.43.04-2.73a4.8 4.8 0 0 0-2.62-3.23C8.4 7.82 4.23 9.94 2.1 12.5c-4.88 5.9-.91 18.17 8.17 16.62m8.41-6.22c.51 3.48 2.99 6.5 6.96 6.36 4.28-.16 6.06-4.1 7-7.5.97-3.4 2.06-7.67.67-11.08-.42-1.03-.68-2.38-1.71-1.53-1.26 1.03-1.41 4.04-1.52 5.44-.2 2.65-.78 9.97-4.1 10.95-4.18 1.22-4.05-5.85-4-7.98.03-1.9.24-3.73-.35-5.58-.3-1-.59-2.44-1.53-1.64-1.29 1.1-1.45 3.83-1.54 5.33a36 36 0 0 0 .13 7.23m19.09 2.85c.2.4.63 1.4 1.02 1.67.95.67-.05.71.8-.05.82-.73 1.13-2.72 1.26-3.67.38-2.96-.12-6.1-.09-9.1 1.02 2.22 1.58 4.6 2.39 6.88.55 1.58 1.4 4.8 3.65 4.75 2.5-.05 2.6-3.14 2.9-4.82a71 71 0 0 1 1.7-7.04c.1 3.91-1.4 11 2.1 13.92a50 50 0 0 0 1.5-4.4c.26-1.7.1-3.45.1-5.15.09-3.6.76-8-.3-11.5-.29-1.14-.94-2.27-2.37-2.24-1.83.04-2.24 2-2.7 3.3a114 114 0 0 0-3.35 10.94c-.54-1.68-5.33-16.42-8.8-10.9-.54.9-.3 2.22-.32 3.2-.04 1.87-.15 3.75-.2 5.63-.06 2.84-.4 5.9.8 8.58M62.1 12.71c.72-.14 5.74-1.73 5.52-.14-.22 1.68-4.63 3.31-5.81 3.88 0-1.2-.24-2.44-.65-3.57zm5.72-.64c-.03-.04 0 0 0 0m.12 8.34c2.27 1.22 1.3 3.42-.43 4.6-.63.56-6.5 1.9-6.49 1.76.18-1.7-.26-5 1-6 1.3-1.05 4.5-.82 5.94-.27m.06-8.01s.01.03 0 0M58 29.33c.23.55.86 1.91 1.57 1.94.86.04.8-1.04.93-1.7 3.44 1.72 8.5-.05 10.9-3.03a6.15 6.15 0 0 0-2.57-9.74c2.1-1.7 4.02-5.4 1.25-7.5a7.7 7.7 0 0 0-8.12-.3c-2.74 1.72-3.85 5.83-4.1 9-.25 3.42-1.15 8.14.14 11.34m18.11-8.4c.07 2.07-.15 4.3.33 6.3.17.72.44 1.52.76 2.17.61 1.2.31 1.06 1.03.37 2.18-2.08 1.21-8.58 1.16-11.25-.04-2.08.06-4.28-.5-6.28-.17-.56-1.13-3.35-1.67-3.3-.8.1-1.37 3.94-1.42 4.7-.15 2.4.23 4.9.31 7.3m18.7.56c-1.58-.14-3.62.07-5.12.56.7-1.9 1.48-4.05 2.24-5.8q.7-1.6 1.5-3.22c1.27 2.68 1.98 5.82 2.82 8.66q-.7-.12-1.44-.2m5.44.72c-.73-2.77-1.58-5.53-2.43-8.27-.54-1.75-1.13-3.92-2.6-5.17-4.2-3.56-6.56 5.85-7.6 8.23-.97 2.3-2.2 4.65-2.84 7.07a10 10 0 0 0-.24 3.63c.2 1.52 0 1.74 1.3.9 1-.62 1.4-1.78 2.22-2.55.14-.14.22-.68.4-.76.18-.1 1.5.25 1.8.27 2.18.17 4.72-.2 6.72-1.03.2.86 1.63 5.98 2.98 5.79.6-.08.96-3.06 1-3.54.08-1.55-.36-3.05-.75-4.54m9.11-13.7c-.26-1.2-.8-3.3-1.84-2.12-1.4 1.6-1.1 5.18-1.1 7.19-.03 1.45-1.56 12.06.55 11.88-.1-.01.84-1.68.98-1.93a12 12 0 0 0 1.32-4.72c.37-3.24.8-7.12.1-10.3M108.2 29.4c-2.23-2.73-6.3.66-5.04 3.38 1.73 3.7 7.33-.57 5.04-3.38m-13.3 4.23c-2.9-.73-6.3-.24-9.25-.15-3.08.1-6.16.27-9.24.36-6.57.2-13.13.1-19.7.04-12.38-.1-24.86.7-37.32.17-2.67-.12-5.54-.72-8.2-.2-.72.13-3 .53-3.32 1.25-.34.76 1.4 1.56 2.33 1.96 2.41 1.04 5.32.86 7.9.96 2.92.12 5.9.06 8.81 0 12.07-.3 24.1-1.35 36.18-1.18 6.97.1 13.93.04 20.9 0 3.32 0 7 .53 10.27-.06.55-.1 3.76-.85 3.8-1.83.03-.46-2.8-1.23-3.12-1.32", fill: "white" } }] }, deer: { elements: [{ name: "path", type: "element", attributes: { "fill-rule": "evenodd", "clip-rule": "evenodd", d: "M71.76 14.26c1.6-.18 4.79-.55 5.2.98.3 1.09-1.16 2.07-2.26 2.8q-.52.36-.85.61l-.16.14a26 26 0 0 1-4.66 3.41 13 13 0 0 1-2.93 1.08c-.28.07-.43.11-.55.2-.15.11-.23.3-.43.74l-.03.08c-.45 1-.73 2.18-1 3.36a23 23 0 0 1-.81 2.95c-1.7 4.46-5.77 14.8-12.27 10.26-1.7-1.2-2.78-3.3-3.75-5.24l-.6-1.2a44 44 0 0 1-3.39-8.24q-.14-.54-.2-.92c-.14-.68-.2-1.04-.93-1.5-.37-.23-.9-.36-1.4-.5q-.55-.11-.99-.28a17 17 0 0 1-4.08-2.44c-1.24-.97-6.11-4.95-2.14-5.7 1.8-.33 4.16-.2 6-.11h.07c2.03.1 4.07.57 5.88 1.54h.01c.9.48 1.22.66 1.54.65.2 0 .38-.08.68-.18q.35-.14.98-.33c-3.32-1.12-6.65-3-8.89-5.78-1.2-1.5-4-7.65-1.9-9.06 1.8-1.2 2.42 2 2.88 4.4.2.97.36 1.8.56 2.17 1.24 2.13 3.28 3.23 5.32 4.33q.88.47 1.72.96a12.5 12.5 0 0 1-3.67-5.86l-.08-.3c-.31-1.14-.9-3.28-.44-4.2.5-1.03 1.73-1.1 2.42-.21.41.53.48 1.52.54 2.4q.04.69.13 1.2a8.6 8.6 0 0 0 2 4.03 11 11 0 0 0 5.65 3.73c5.13 1.26 6.92-4.1 7.61-8.25q.06-.37.08-.81c.05-.93.11-2 .97-2.36 1.37-.6 1.9.74 1.94 1.78.09 2.3-1.06 5.85-2.17 7.84 2.8-1.73 5-4.48 5.9-7.7.1-.36.15-.9.2-1.45.1-1.2.21-2.58.97-3.04 1.54-.92 2.02.92 1.97 2.02-.32 6.52-5.3 12.44-11.49 14.07l.55.28c.95.5.98.53 2.3-.25q1.36-.8 2.84-1.24c1.47-.45 3.05-.68 4.58-.81zm-12.9 9.36c-.07 3.27-3.24 3.04-2.82.1.32-2.32 3.68-2.24 2.82-.1m-1.93 9.02c-.5 1.56-4.33 2.12-3.9-.17.37-1.95 4.56-2.03 3.9.17M51.7 26c-2.82 0-1.9-4.87 1-3.86 2.27.8 1.33 3.86-1 3.86", fill: "white" } }] }, diamond: { elements: [{ name: "path", type: "element", attributes: { "fill-rule": "evenodd", "clip-rule": "evenodd", d: "M63.78 28.74a320 320 0 0 1-7.34 7.82c1-3.56 1.74-7.58 3.2-10.96.43-.96.1-1.08.94-1.5.6-.3 2.07.05 2.8.07 1.56.04 3.15.19 4.7-.05q-2.19 2.27-4.3 4.62M48.52 32.8c-2.7-3.28-5.39-6.57-8.66-9.32 1.29.14 2.7-.04 3.96.2 1.94.4 1.83 1 2.82 2.97a99 99 0 0 1 4.05 8.82q-1.08-1.35-2.17-2.67m-9.1-12.53c.96-1.58 1.14-2.98 2.92-3.78 2.06-.94 5.3-.74 7.49-.92-1.37 1.52-3.04 3.1-3.6 5.12a9.5 9.5 0 0 0-3.68-4.17c-.21-.1 1.16 4.55 1.34 4.87-1.72-.1-3.52-.4-5.22-.1zm16.4-5.01q2.4.04 4.74.42c-1.26 1.67-1.64 3.63-2.1 5.63-.47-2.26-2.2-4.36-3.73-6.05zm-3.5 1.07c.24-.16 4.46 5.09 5.07 5.56-3.31 0-6.62-.17-9.92-.32 1.9-1.48 3.02-3.68 4.86-5.24m2.7 17.1q-.58 2.03-1.22 4.05c-1.56-4.74-3.86-9.2-6.01-13.68q5.01.15 10.02.26c-.82 3.16-1.87 6.24-2.8 9.37m7.22-17.46a36 36 0 0 1 3.87 4.44l1.26 1.65c-2.23-.23-4.54-.13-6.78-.15.5-2.06 1.1-4.01.58-6.13zm7.65 5.6c-2.16-2.66-4.37-7.25-7.86-8.06-3.48-.8-7.55-.45-11.08-.22-3.07.2-8.08-.2-10.8 1.59-1.39.92-2.42 3-2.9 4.55-.44 1.4.27 2.28-1.25 2.28-.1 0 2.5 3.68 2.81 3.97a78 78 0 0 1 6.46 6.6c2.83 3.37 5.4 8.33 9.14 9.73-.68-.34 2.8-2.97 3.21-3.42q3.18-3.42 6.38-6.83c1.94-2.07 4.05-4.03 5.93-6.15 1.43-1.62 1.44-2.17-.04-4.02M36 13c.04.01-.9-2.05-.83-1.92a6 6 0 0 0-1.73-1.73c-.74-.5-4.3-1.1-4.44-1.35 1.5 2.65 4.17 4.13 7 5m15.36-4.8q.25.98.79 1.8c.07.08.86-4.18.85-4.55C53 4.83 52.6 1 51.8 1c-1.33 0-.67 6.47-.45 7.2M77.97 6c-3 0-9.68 5.85-8.9 9a3 3 0 0 0 .4-.33c1.27-1.02 2.72-2.02 4-3.2.9-.85 1.98-1.61 2.8-2.54.1-.1 2-2.93 1.7-2.93", fill: "white" } }] }, hola: { elements: [{ name: "path", type: "element", attributes: { d: "M63.84 16q-.43.98-.82 1.95L63 18l2-.16A19 19 0 0 0 63.84 16m-10.62.3c.2-.06.42-.13.7-.3.15.42.26 3.29-1.35 2.98-.92-.18-.5-1.77-.25-2.1.34-.41.6-.49.9-.58", fill: "white" } }, { name: "path", type: "element", attributes: { "fill-rule": "evenodd", "clip-rule": "evenodd", d: "M74.64 15.95C73.46 10.68 70.6 6.97 66.18 4c-3.35-2.25-6.5-2.23-10.46-1.75a24 24 0 0 0-9.2 2.94c-5.04 2.89-7.92 6.74-8.6 12.54-.28 2.33-.33 5.1.5 7.32.48 1.3 1.34 2.34 2.25 3.36.15.17.5.47.86.79.6.52 1.26 1.1 1.28 1.29.12.86-2.2 3.4-2.89 4.15l-.12.14c-.23.25-.73.6-1.3.99-1.02.7-2.25 1.55-2.43 2.2-.83 2.93 5.83 1.89 7.45 1.63a37 37 0 0 0 4.62-.98q1.06-.3 2.07-.72c.56-.23 1.17-.7 1.78-1.16.7-.52 1.38-1.03 1.97-1.2a6 6 0 0 1 2.1.02c.6.07 1.2.14 1.7.1a26 26 0 0 0 4.5-.88 19 19 0 0 0 7.05-3.84c4.42-3.76 6.6-9.24 5.33-15m-5.13 7c-.62.15-1.36-1.25-1.08-1.73.77-1.34 2.16 1.42 1.08 1.72m-2.22-9.38c-.27 1.1.12 2.95.4 4.05.04.36.4.47.7.43.55-.08.45-.56.36-.97q-.05-.24-.06-.4c.04-.75.11-2.64-.17-3.32-.5-1.26-.97-1.02-1.27.21m-.65 8.33c-.58.34-.86-.29-1.05-.74q-.08-.2-.16-.32a1.4 1.4 0 0 1-.29-.72c0-.18-.02-.22-.58-.39-1.77-.52-1.8.7-1.84 1.94 0 .72-.03 1.45-.39 1.84-1.78 1.91-.58-3.68-.37-4.68l.03-.1.12-.67c.34-1.95 1.02-5.85 2.67-3.1.5.8 2.7 6.5 1.87 6.98m-10.37-.95c.6.6 3.7.22 4.02-.34.68-1.18-1.85-.85-2.78-.73l-.29.03q.08-1.12.21-2.27c.12-1.05.24-2.1.23-3.15v-.17c.02-.62.06-1.94-.96-1.2-.34.24-.33 1.18-.33 1.81v.46c-.02.23-.08.6-.15 1.02-.24 1.51-.6 3.87.04 4.54m-.77-2.78c-1.43 5.73-6.98 2.64-4.5-1.7.46-.8.83-.99 1.41-1.27q.32-.14.75-.4.07-.05.06-.27c0-.27.01-.65.42-.64 1.76.03 2.18 2.93 1.85 4.28m-7 .83c-.04.88-.14 3.31.97 3.01.76-.19.54-9.97-.33-9.97-.92 0-.75 1.78-.6 3.33.1 1 .2 1.91-.04 2.17-.1.12-.5.1-.84.06h-.4c-1.15.2-1.9.08-2.25-.6-.1-.2-.1-.7-.1-1.3 0-1.33-.02-2.96-1.15-1.5l.03 2.2q.5 1.08-.38 1.32c-.02.3.16.58.28.77q.11.16.12.24.02.24 0 .67c-.09 1.26-.2 3.54.91 3.4.71-.08.5-2.28.37-3.42l-.05-.6.91.03c.86.04 1.73.08 2.56-.03z", fill: "white" } }] }, pizza: { elements: [{ name: "path", type: "element", attributes: { "fill-rule": "evenodd", "clip-rule": "evenodd", d: "M65.93 24.4c-4.08 1.37-8.55 3.31-10.9 7.06-1.85 2.95-1.97-.45-4.55.6-2.5 1.02-1.82 5.22-2.73 7.3-.7-1.2-1.05-2.52-1.94-3.6a7 7 0 0 0 1.81-1.73c.16-.32-4.79.35-5.07.43-1.4.4-2.74.77-4.09 1.43a79 79 0 0 0 1.96-3q.31-1.01 1.11 0c.75.04 1.18.36 1.96.18 2.92-.66 3.85-6.22.25-5.98a93 93 0 0 0 4.26-8.8c.5 4.28 6.08 2.8 7.72.52 2.14-3-.6-8.66-4.49-8.11.58-1.38 1.17-2.77 1.65-4.18 1.1 1.6 3 2.39 4.54 3.45a18 18 0 0 1 4.16 4c2.4 3.15 3.8 7 6.22 10.06q-.96.06-1.87.36m9-4.4c-.62-5.78-5.14-11.63-9.43-15.21-2.55-2.12-10.24-7.4-13.3-3.33 2.46 1.06 5.2 1.32 7.64 2.48 3.32 1.57 5.92 4.16 8.17 7.05 3.14 4.05 7.97 12.28.48 14.39.5-.34.8-.71 1.2-1.31-1-.23-.6-1.88-.97-2.95-.4-1.25-1.2-2.47-1.89-3.6a57 57 0 0 0-3.5-5.16A24 24 0 0 0 57.4 7c-.9-.58-1.77-1.1-2.81-1.4-1.35-.4-.91.08-1.28-1.15-.23-.78-.02-1.77-.25-2.6-1.97 1.66-2.6 4.06-3.5 6.39-1.01 2.68-2.12 5.33-3.2 8-2.63 6.53-6.02 12.39-9.88 18.24-.67 1.02-2.17 2.95-1.1 4.17.97 1.1 2.34.3 3.4-.13 1.43-.6 3.38-2.17 4.93-1.35 2 1.05 1.05 4.98 4.2 4.83 3.13-.16 2.54-5.28 3.54-7.32 2.3 1.68 4.18.64 5.58-1.61 1.63-2.61 3.77-3.66 6.5-4.94 1.13-.52 3.05-1.94 4.2-2.12.98-.1 1.9.9 3.2.88 3.1-.11 4.39-4.25 4.02-6.85", fill: "white" } }, { name: "path", type: "element", attributes: { "fill-rule": "evenodd", "clip-rule": "evenodd", d: "M53.54 22.83c-2.43-.44-5.8-.07-6.03 3.16-.14 1.97 1.4 3.85 3.08 4.66 5.12 2.5 9.1-6.69 2.95-7.82m9.8-3.67c-.65-.7-1.7-1.24-2.68-1 .31-.2.57-.6.87-.83-3.16-2.29-5.14 3.47-3.35 5.74 2.72 3.44 8.04-.76 5.16-3.91", fill: "white" } }] }, resist: { elements: [{ name: "path", type: "element", attributes: { "fill-rule": "evenodd", "clip-rule": "evenodd", d: "M105.57 29.07c-3.09-.66-5.2 3.54-1.92 4.79 2.82 1.07 4.85-4.15 1.9-4.79M104.21 26c3.65 0 2.3-5.98 2.31-7.97.02-2.13 1.55-8.6-.89-9.73-4.21-1.97-3.06 6.33-3.03 7.97.03 1.82.16 3.72-.23 5.5-.35 1.59-1.13 4.23 1.83 4.23M99.06 9.97c-1.08-.62-2.8-.32-3.99-.37-1.35-.06-2.69-.2-4.03-.3-2.18-.15-4.96-.56-7.12-.06-1.23.28-2.34 1.22-1.76 2.6.62 1.5 2.3 1.1 3.58 1.04.58-.04 2.03-.3 2.6-.1 1 .36.58-.1.8 1.08.35 1.8.14 4 .13 5.83q-.03 4.78-.1 9.54c-.03 1.23-.45 2.63.75 3.45 1 .68 2.22.22 2.74-.8.5-1 .02-3.06-.03-4.2-.07-1.34-.14-2.67-.1-4.02.1-3.58.28-7.16.37-10.75.94.05 1.92.02 2.85.15.69.1 1.67.53 2.33.5 1.9-.1 2.69-2.59.98-3.59m-28.34 6.84c-.08-.64-.01-.05 0 0m-.03-.27q0 .01 0 0m1.43-3.1c3.4-3.99 4.58 4.33 7.24 4 4.26-.58-.94-6.97-2.67-7.79-3.51-1.68-6.6.08-8.27 3.26-2.1 4-.77 6.7 3.26 8.45 1.47.63 7.03 2.52 5.53 4.96-.76 1.22-3.53 1.32-4.7 1.08-2.3-.48-1.91-2.08-3.1-3.57-1-1.34-3-.95-3.3.78-.25 1.36 1.17 3.42 2.1 4.38 2.25 2.26 6.05 2.44 8.9 1.4 4.39-1.57 4.92-5.7 1.8-8.9-1.74-1.87-3.93-2.4-6.1-3.49-2.65-1.29-2.16-2.39-.6-4.64m-10.45 15.2c-.56-4.83-.7-9.72-.78-14.57-.03-1.52.7-5.2-1.45-5.83-2.92-.9-2.53 2.7-2.47 4.16.2 4.92.84 9.8 1.07 14.7.07 1.57-.43 4.58 1.83 4.96 2.75.43 2-2.12 1.8-3.4m-9.28-15.9a6.74 6.74 0 0 0-10.1-.75c-2.06 2.06-3.37 6.92-1.4 9.4 2.12 2.7 7.35.34 8.72 3.4 1.68 3.73-2.73 5.14-5.07 2.65-.85-.9-.66-2.45-1.9-3-1.77-.8-2.87.92-2.52 2.35.85 3.5 4.65 5.4 8.1 5.27 3.77-.12 5.4-2.97 5.16-6.4-.33-4.73-3.98-5.47-8-6-1.7-.2-1.9-.2-1.8-1.94.13-2.12 1.37-4.57 4-4.07 2.1.4 2.3 3.57 4.44 3.72 3.5.24 1.26-3.43.37-4.62M34.72 28.46c-1.34.32-2.96.1-4.33.07-1.05-.02-4.57.43-5.26-.3-.76-.8-.5-3.24-.54-4.28-.05-1.45-.4-1.67.87-2 .75-.2 1.9-.1 2.68-.13 1.52-.07 3.47.2 4.93-.09 1.37-.28 2.5-1.75 1.25-3-.88-.9-2.54-.42-3.63-.4-2.03.06-4.07.05-6.1.08 0-1.56-.1-3.13 0-4.69 2.84.11 5.8.83 8.66.71 1.44-.08 3.04-1 2.3-2.74-.62-1.5-2.52-1.3-3.84-1.35q-2.5-.1-4.97-.17c-1.23-.04-3-.44-4.17.1-2.37 1.14-1.56 5.02-1.49 7.12.08 2.67.08 5.27.17 7.96.1 2.43-.04 5.64 2.85 6.32s6.24.03 9.2.18c1.2.05 2.85.4 3.44-1 .57-1.35-.73-2.77-2.14-2.42M11.4 13.91c2.33.5 2.95 3.01 3.03 5.15.05 1.46.18 1.37-1 1.74-1.2.37-2.92.17-4.14.12-2.54-.11-2.24-.28-2.29-2.95 0-.62-.47-3.5-.1-3.91.47-.53 3.83-.2 4.5-.15m5.09 14.84a52 52 0 0 0-4.13-4.29c2.17-.06 4.5-.47 5.28-2.82.65-1.98.09-5-.67-6.87a7 7 0 0 0-5.62-4.48c-1.8-.25-6.28-.67-7.62.7-1.46 1.52-.45 5.66-.36 7.5.16 3.28.05 6.53-.15 9.8-.07 1.05-.6 2.78-.05 3.73a1.98 1.98 0 0 0 2.96.49c1-.84.53-1.87.47-2.95-.1-1.68.09-3.4.19-5.08 1.6 1.3 3.25 2.59 4.76 4.02 1.49 1.4 2.56 3.2 3.99 4.62 1 1 2.82 1.43 3.33-.45.44-1.6-1.57-2.95-2.45-3.97", fill: "white" } }] }, skull: { elements: [{ name: "path", type: "element", attributes: { "fill-rule": "evenodd", "clip-rule": "evenodd", d: "M65.28 18.93c-.3 2.78-5.7 4.27-7.67 2.45-.91-.84-.93-2.58-1.13-3.7a49 49 0 0 1-.75-6.43c-.06-1.32-.4-2.38 1.04-2.58.89-.12 1.8.47 2.52.93 2.42 1.58 6.3 6.14 5.96 9.33m-12.4-5.85c.3 2.82 1.32 7.73-.93 10.1-2.02 2.12-6.16.02-6.79-2.47-.77-3.1 2.28-6.78 4.15-8.87.58-.64 1.85-2.4 2.84-1.82.4.23.7 2.61.74 3.06m1.44 11.03c.66-1.53 6.92 3.01 3.96 5.18-.48.35-4.16 1.46-4.86.94-1.48-1.1.43-4.97.91-6.12m19.01-7.58C72.89 1.05 53.08-3.3 42.49 5.5c-4.06 3.38-6.4 7.5-6.5 12.78-.1 4.47.63 8.7 4.04 11.77 1.48 1.33 2.46 2.15 3.25 3.97.82 1.9 1.2 4.33 2.74 5.83.85.83 2.09 1.5 3.26.96 2.17-.98 1.47-3.98 2.13-5.65 2.04 4.97 7.21 6.55 8.15.25 1.03 1.82 3.72 4.2 5.7 2.2.81-.8.93-2.14 1.07-3.22.25-1.9-.18-2.66 1.36-3.97 4.03-3.45 5.77-8.67 5.63-13.9", fill: "white" } }] }, skullOutline: { elements: [{ name: "path", type: "element", attributes: { "fill-rule": "evenodd", "clip-rule": "evenodd", d: "M72.34 17.04a9 9 0 0 1-1 2.99c-.71 1.21-2.02 1.7-2.78 2.82-1.19 1.75.4 4.27-.78 5.83-1.27 1.68-4.14.67-5.26 2.9-1.18 2.35.53 5.49-.95 7.83-1.47-.37-1.92-5.9-4.19-2.37-1.45 2.25-.47 3.47-2.64.23-.76-1.12-1.62-2.13-3.1-1.4-1.04.53-1.26 2.85-2.21 3.1-2.33.6-2.42-5.62-3.21-6.8a2.8 2.8 0 0 0-1.62-1.28c-.67-.2-1.87.22-2.43-.1-1.04-.59-1.18-2.55-1.22-3.6-.07-1.93.58-3.91.04-5.83-.45-1.61-1.89-2.6-2.36-4.18C36.1 8.64 47.68 3.9 54.3 3.63c7.74-.3 19.04 4.22 18.04 13.4m1.83-5.32c-1.45-3.44-4.65-6.17-7.91-8q-2.4-1.36-5.09-1.95c-1.64-.36-3.55-.12-5.12-.58C54.73.81 53.9-.05 52.35 0c-2.11.07-4.31 1.17-6.16 2.09-3.66 1.8-6.77 4.15-8.73 7.74-2.1 3.86-1.9 7.36.35 10.95 2.15 3.44-.97 8.27 2.17 11.53 1.32 1.37 2.62.37 3.87 1.03.96.5.92 3.46 1.19 4.33 1.2 3.9 5.5 5.4 7.5 1.2.94 2.34 4.66 4.75 6.39 1.68 1.08 1.4 2.95 2 4.38.8 1.35-1.14 1.5-3.76 1.56-5.35.06-1.24-.5-2.77.46-3.66 1.04-.98 3.2-.57 4.37-1.84 1.34-1.45.78-3.14.89-4.87.1-1.75.4-1.3 1.7-2.56 2.9-2.8 3.38-7.8 1.88-11.35", fill: "white" } }, { name: "path", type: "element", attributes: { "fill-rule": "evenodd", "clip-rule": "evenodd", d: "M50.42 28.12c2.02-1.82 1.6-7.4 1.42-9.96-.31-4.86-3.35-3.4-5.2-.38-1.4 2.3-4.77 6-3.26 8.88 1.2 2.3 5.18 3.13 7.04 1.46m13.38-8.85c-1.04-1.92-1.43-2.2-2.66-3.78-.8-1-1.9-2.8-3.4-2.44-2.59.62-1.53 6.6-1.5 8.4.02 1.36-.28 2.76.85 3.73 1.15.98 3.05.9 4.44.7 4.26-.65 4.06-3.27 2.26-6.6m-8.55 12.55c-.28-.04.08-.36.12-.59.19.62.33.65-.12.6m1.04-4.32c-2.61-2.77-7.57 6.4-4.08 7.43.8.23 1.4-.37 2.16-.47 1.1-.16 2.02.48 2.97-.53 1.5-1.58.2-5.1-1.05-6.43", fill: "white" } }] } } }, eyebrows: { width: 96.27, height: 24, variants: { angry: { elements: [{ name: "path", type: "element", attributes: { d: "M7.75 15.18c4.24-5.76 6.88-5.48 13.31-.62l.67.5c4.83 3.67 7.12 4.94 10.4 4.94a2 2 0 0 0 0-4c-2.06 0-3.9-1.02-7.98-4.12l-.68-.52C19.71 8.53 17.51 7.3 14.77 7c-3.68-.4-7.05 1.48-10.24 5.83a2 2 0 1 0 3.22 2.36m80.78 0c-4.24-5.77-6.88-5.49-13.32-.63l-.67.5c-4.82 3.67-7.1 4.94-10.4 4.94a2 2 0 0 1 0-4c2.06 0 3.9-1.02 7.99-4.12l.67-.52C76.56 8.53 78.76 7.3 81.5 7c3.68-.4 7.06 1.48 10.25 5.83a2 2 0 1 1-3.22 2.36", fill: "black", "fill-opacity": ".6" } }] }, angryNatural: { elements: [{ name: "path", type: "element", attributes: { "fill-rule": "evenodd", "clip-rule": "evenodd", d: "M11.43 5.01a7.2 7.2 0 0 0-6.44 2.43c-.6.73-1.55 2.48-1.5 3.42 0 .35.22.37 1.12.6 1.64.38 4.5-1.13 6.35-1 2.59.2 5.05 1.4 7.29 2.69 3.84 2.2 8.35 6.84 13.09 6.6.35-.02 5.42-1.74 4.4-2.72-.31-.49-3.02-1.13-3.5-1.36-2.16-1.09-4.36-2.45-6.43-3.72C21.28 9.18 16.86 5.6 11.42 5m73.62.01c2.37-.27 4.86.5 6.43 2.43.59.73 1.55 2.48 1.5 3.42 0 .35-.22.37-1.12.6-1.64.38-4.5-1.13-6.35-1-2.58.2-5.05 1.4-7.28 2.69-3.84 2.2-8.36 6.84-13.1 6.6-.35-.02-5.42-1.74-4.4-2.72.3-.49 3.03-1.13 3.5-1.36 2.17-1.09 4.36-2.45 6.44-3.72C75.19 9.18 79.6 5.6 85.04 5", fill: "black", "fill-opacity": ".6" } }] }, default: { elements: [{ name: "path", type: "element", attributes: { d: "M7.77 17.16c3.91-5.51 14.64-8.6 23.89-6.33a2 2 0 0 0 .95-3.88c-10.73-2.64-23.16.94-28.1 7.9a2 2 0 0 0 3.3 2.3m80.73.01c-3.9-5.5-14.64-8.6-23.9-6.33a2 2 0 0 1-.94-3.88c10.74-2.64 23.17.94 28.1 7.9a2 2 0 0 1-3.25 2.3", fill: "black", "fill-opacity": ".6" } }] }, defaultNatural: { elements: [{ name: "path", type: "element", attributes: { "fill-rule": "evenodd", "clip-rule": "evenodd", d: "M18.68 6.15c-5.8.27-15.2 4.49-14.95 10.34 0 .15.3.24.43.1 2.75-2.97 22.31-5.96 29.2-4.37.63.14 1.11-.48.71-.93-3.42-3.82-10.17-5.4-15.39-5.15m59.91 0c5.8.27 15.2 4.49 14.95 10.34 0 .15-.29.24-.42.1-2.76-2.97-22.32-5.96-29.2-4.37-.64.14-1.12-.48-.72-.93 3.42-3.84 10.2-5.42 15.4-5.17", fill: "black", "fill-opacity": ".6" } }] }, flatNatural: { elements: [{ name: "path", type: "element", attributes: { "fill-rule": "evenodd", "clip-rule": "evenodd", d: "M30.8 11.1c-5 .35-9.93.08-14.92-.13-3.83-.16-7.72-.68-11.37 1-.7.33-4.53 2.29-4.45 3.36.08.85 3.94 2.2 4.64 2.44 3.66 1.29 7.18.9 10.95.66 4.63-.27 9.23-.07 13.86-.2 3.18-.1 7.98-.63 9.5-4.4.48-1.14.1-3.42-.34-4.66-.2-.5-.72-.69-1.13-.4a15 15 0 0 1-6.68 2.32m34.67 0c4.99.36 9.9.09 14.9-.12 3.83-.16 7.72-.68 11.38 1 .7.33 4.53 2.29 4.44 3.36-.07.85-3.94 2.2-4.63 2.44-3.67 1.29-7.18.9-10.96.66-4.62-.27-9.23-.07-13.86-.2-3.11-.1-7.91-.63-9.45-4.4-.47-1.14-.1-3.42.36-4.66.18-.5.72-.69 1.12-.4a15 15 0 0 0 6.7 2.32", fill: "black", "fill-opacity": ".6" } }] }, frownNatural: { elements: [{ name: "path", type: "element", attributes: { "fill-rule": "evenodd", "clip-rule": "evenodd", d: "M28.5 6.88c-1.96 2.9-5.54 4.64-8.73 5.68-3.94 1.29-18.55 3.38-15.11 11.35.05.12.22.12.27 0 1.15-2.65 17.46-5.12 18.97-5.7 4.45-1.71 8.4-5.5 9.16-10.55.36-2.31-.63-6.05-1.54-7.55-.1-.18-.38-.13-.43.07-.36 1.33-1.4 4.97-2.58 6.7m39.28 0c1.97 2.9 5.54 4.64 8.74 5.68 3.96 1.29 18.57 3.38 15.13 11.35a.15.15 0 0 1-.28 0c-1.15-2.65-17.46-5.12-18.97-5.7-4.44-1.71-8.4-5.5-9.16-10.55-.35-2.31.64-6.05 1.55-7.55.1-.18.37-.13.43.07.35 1.33 1.4 4.97 2.57 6.7", fill: "black", "fill-opacity": ".6" } }] }, raisedExcited: { elements: [{ name: "path", type: "element", attributes: { d: "M8.11 17.13C9.61 7.6 22.2 1.1 31.31 5.3a2 2 0 0 0 1.66-3.63C21.5-3.63 6.07 4.33 4.17 16.5a2 2 0 1 0 3.94.63m80.05 0C86.66 7.6 74.08 1.1 64.97 5.3a2 2 0 0 1-1.67-3.63c11.5-5.3 26.9 2.66 28.81 14.83a2 2 0 0 1-3.95.63", fill: "black", "fill-opacity": ".6" } }] }, raisedExcitedNatural: { elements: [{ name: "path", type: "element", attributes: { "fill-rule": "evenodd", "clip-rule": "evenodd", d: "m14.9 1.58.91-.4C21.06-.9 29-.03 33.86 2.3c.57.27.18 1.15-.4 1.1C18.54 2.27 8.5 11.56 5.08 17.86c-.1.18-.4.2-.48.03C2.3 12.56 9.05 3.9 14.9 1.58m66.47 0-.91-.4C75.22-.9 67.27-.03 62.4 2.3c-.56.27-.18 1.15.4 1.1 14.93-1.14 24.98 8.15 28.4 14.45.1.18.4.2.47.03 2.3-5.32-4.45-13.98-10.3-16.3", fill: "black", "fill-opacity": ".6" } }] }, sadConcerned: { elements: [{ name: "path", type: "element", attributes: { d: "M30.17 5.6c-1.48 8.38-14.1 14.17-23.24 10.42a2.04 2.04 0 0 0-2.63 1c-.44.97.03 2.1 1.05 2.5 11.44 4.7 26.83-2.37 28.76-13.3a1.9 1.9 0 0 0-1.64-2.2 2 2 0 0 0-2.3 1.57m35.93 0c1.5 8.39 14.1 14.18 23.25 10.43 1.01-.41 2.2.03 2.62 1s-.03 2.1-1.04 2.5c-11.45 4.7-26.84-2.37-28.77-13.3a1.9 1.9 0 0 1 1.65-2.2 2 2 0 0 1 2.32 1.57", fill: "black", "fill-opacity": ".6" } }] }, sadConcernedNatural: { elements: [{ name: "path", type: "element", attributes: { "fill-rule": "evenodd", "clip-rule": "evenodd", d: "m23.37 20.42-.91.4c-5.24 2.09-13.2 1.21-18.06-1.12-.56-.27-.18-1.15.4-1.1 14.92 1.14 24.97-8.15 28.38-14.45.1-.18.4-.2.48-.03 2.31 5.32-4.45 13.98-10.3 16.3m49.54 0 .9.4c5.26 2.09 13.2 1.2 18.06-1.12.57-.27.18-1.15-.4-1.1-14.92 1.14-24.96-8.15-28.38-14.45-.1-.18-.4-.2-.48-.03-2.3 5.32 4.45 13.98 10.3 16.3", fill: "black", "fill-opacity": ".6" } }] }, unibrowNatural: { elements: [{ name: "path", type: "element", attributes: { "fill-rule": "evenodd", "clip-rule": "evenodd", d: "M88.26 7.6c1.46.56 9.19 6.43 7.86 9.16a.8.8 0 0 1-1.29.22 11 11 0 0 0-1.7-1.2c-5.11-2.83-11.3-1.92-16.74-.9-6.12 1.14-12.1 3.48-18.38 2.67-2.04-.26-6.08-1.22-7.63-2.96-.47-.53-.06-1.38.64-1.43 1.44-.11 2.86-.86 4.33-1.28 3.65-1.03 7.4-1.56 11.11-2.3 6.62-1.3 15.17-4.52 21.8-2", fill: "#DADADA" } }, { name: "path", type: "element", attributes: { "fill-rule": "evenodd", "clip-rule": "evenodd", d: "M50.9 12.76c-1.17.04-2.8 3.56-.56 3.68 2.23.11 1.73-3.72.56-3.68m-3.76.04q0-.01 0 0M8.02 7.56c-1.47.56-9.2 6.43-7.87 9.16.24.5.9.6 1.3.22.54-.52 1.57-1.11 1.7-1.18 5.1-2.84 11.3-1.93 16.73-.91 6.12 1.15 12.1 3.49 18.4 2.68 2.03-.26 6.07-1.22 7.6-2.96.48-.53.08-1.38-.62-1.43-1.44-.11-2.86-.86-4.33-1.28-3.65-1.03-7.4-1.56-11.12-2.3-6.62-1.3-15.17-4.52-21.8-2", fill: "#DADADA" } }, { name: "path", type: "element", attributes: { "fill-rule": "evenodd", "clip-rule": "evenodd", d: "M47.1 11.79c1.18.04 2.77 4.5.54 4.67-2.24.18-1.7-4.71-.53-4.67", fill: "#DADADA" } }] }, upDown: { elements: [{ name: "path", type: "element", attributes: { d: "M7.73 14.16c4.5-6.32 14.01-9.5 23.75-6.36a2 2 0 1 0 1.23-3.81c-11.4-3.7-22.74.1-28.24 7.85a2 2 0 1 0 3.26 2.32m80.78 7c-3.91-5.51-14.64-8.6-23.89-6.33a2 2 0 0 1-.95-3.88c10.73-2.64 23.16.94 28.1 7.9a2 2 0 0 1-3.26 2.3", fill: "black", "fill-opacity": ".6" } }] }, upDownNatural: { elements: [{ name: "path", type: "element", attributes: { "fill-rule": "evenodd", "clip-rule": "evenodd", d: "m14.9 1.58.91-.4C21.06-.9 29-.03 33.86 2.3c.57.27.18 1.15-.4 1.1C18.54 2.27 8.5 11.56 5.08 17.86c-.1.18-.4.2-.48.03C2.3 12.56 9.05 3.9 14.9 1.58m64.23 10.49c5.76.77 14.75 5.8 14 11.6-.03.2-.32.26-.44.1-2.49-3.2-21.7-7.87-28.72-6.9-.64.1-1.06-.57-.62-.98 3.74-3.54 10.62-4.52 15.78-3.82", fill: "black", "fill-opacity": ".6" } }] } } }, eyes: { width: 84, height: 36.27, variants: { closed: { elements: [{ name: "path", type: "element", attributes: { "fill-rule": "evenodd", "clip-rule": "evenodd", d: "M2.16 19.55C4.01 23.35 8.16 26 13 26c4.81 0 8.96-2.63 10.82-6.4.55-1.13-.24-2.05-1.03-1.37a15 15 0 0 1-9.8 3.43c-3.73 0-7.12-1.24-9.55-3.23-.9-.73-1.82.01-1.28 1.12m58 0c1.85 3.8 6 6.45 10.84 6.45 4.81 0 8.96-2.63 10.82-6.4.55-1.13-.24-2.05-1.03-1.37a15 15 0 0 1-9.8 3.43c-3.76 0-7.15-1.24-9.58-3.23-.9-.73-1.82.01-1.28 1.12", fill: "black", "fill-opacity": ".6" } }] }, cry: { elements: [{ name: "path", type: "element", attributes: { d: "M11 19s-6 7.27-6 11.27a6 6 0 1 0 12 0c0-4-6-11.27-6-11.27", fill: "#92D9FF" } }, { name: "path", type: "element", attributes: { d: "M22 14a6 6 0 1 1-12 0 6 6 0 0 1 12 0m52 0a6 6 0 1 1-12 0 6 6 0 0 1 12 0", fill: "black", "fill-opacity": ".6" } }] }, default: { elements: [{ name: "path", type: "element", attributes: { d: "M22 14a6 6 0 1 1-12 0 6 6 0 0 1 12 0m52 0a6 6 0 1 1-12 0 6 6 0 0 1 12 0", fill: "black", "fill-opacity": ".6" } }] }, eyeRoll: { elements: [{ name: "path", type: "element", attributes: { d: "M30 14a14 14 0 1 1-28 0 14 14 0 0 1 28 0m52 0a14 14 0 1 1-28 0 14 14 0 0 1 28 0", fill: "white" } }, { name: "path", type: "element", attributes: { d: "M22 6a6 6 0 1 1-12 0 6 6 0 0 1 12 0m52 0a6 6 0 1 1-12 0 6 6 0 0 1 12 0", fill: "black", "fill-opacity": ".7" } }] }, happy: { elements: [{ name: "path", type: "element", attributes: { "fill-rule": "evenodd", "clip-rule": "evenodd", d: "M2.16 14.45C4.01 10.65 8.16 8 13 8c4.81 0 8.96 2.63 10.82 6.4.55 1.13-.24 2.05-1.03 1.37a15 15 0 0 0-9.8-3.43c-3.73 0-7.12 1.24-9.55 3.23-.9.73-1.82-.01-1.28-1.12m58 0C62.01 10.65 66.16 8 71 8c4.81 0 8.96 2.63 10.82 6.4.55 1.13-.24 2.05-1.03 1.37a15 15 0 0 0-9.8-3.43c-3.76 0-7.15 1.24-9.58 3.23-.9.73-1.82-.01-1.28-1.12", fill: "black", "fill-opacity": ".6" } }] }, hearts: { elements: [{ name: "path", type: "element", attributes: { d: "M21.96 2c-2.55 0-5.08 1.98-6.46 3.82C14.1 3.98 11.6 2 9.04 2 3.55 2 0 5.33 0 9.64c0 5.73 4.41 9.13 9.04 12.74 1.66 1.23 4.78 4.4 5.17 5.1.4.68 2.13.7 2.62 0 .47-.73 3.5-3.87 5.16-5.1 4.63-3.6 9.04-7 9.04-12.74C31 5.34 27.46 2 21.97 2m53 0c-2.55 0-5.08 1.98-6.46 3.82C67.1 3.98 64.6 2 62.04 2 56.54 2 53 5.33 53 9.64c0 5.73 4.41 9.13 9.04 12.74 1.66 1.23 4.78 4.4 5.17 5.1.38.68 2.1.7 2.58 0 .48-.73 3.5-3.87 5.17-5.1 4.63-3.6 9.04-7 9.04-12.74C84 5.34 80.45 2 74.96 2", fill: "#FF5353", "fill-opacity": ".8" } }] }, side: { elements: [{ name: "path", type: "element", attributes: { d: "M13 8c-4.84 0-9 2.65-10.84 6.45-.54 1.1.39 1.85 1.28 1.12a15 15 0 0 1 9.8-3.22 6 6 0 1 0 10.7 2.8 2 2 0 0 0-.12-.74l-.15-.38a6 6 0 0 0-1.64-2.48C19.9 9.32 16.5 8 13 8m58 0c-4.84 0-9 2.65-10.84 6.45-.54 1.1.39 1.85 1.28 1.12a15 15 0 0 1 9.8-3.22 6 6 0 1 0 10.7 2.8 2 2 0 0 0-.12-.74l-.15-.38a6 6 0 0 0-1.64-2.48C77.9 9.32 74.5 8 71 8", fill: "black", "fill-opacity": ".6" } }] }, squint: { elements: [{ name: "path", type: "element", attributes: { d: "M30 12.73c0 4.26-6.27 7.72-14 7.72S2 17 2 12.73 8.27 5 16 5s14 3.46 14 7.73m52 0c0 4.26-6.27 7.72-14 7.72S54 17 54 12.73 60.27 5 68 5s14 3.46 14 7.73", fill: "white" } }, { name: "path", type: "element", attributes: { d: "M18.82 20.3a25 25 0 0 1-5.64 0 6 6 0 1 1 5.64 0m52 0a25 25 0 0 1-5.64 0 6 6 0 1 1 5.64 0", fill: "black", "fill-opacity": ".7" } }] }, surprised: { elements: [{ name: "path", type: "element", attributes: { d: "M30 14a14 14 0 1 1-28 0 14 14 0 0 1 28 0m52 0a14 14 0 1 1-28 0 14 14 0 0 1 28 0", fill: "white" } }, { name: "path", type: "element", attributes: { d: "M22 14a6 6 0 1 1-12 0 6 6 0 0 1 12 0m52 0a6 6 0 1 1-12 0 6 6 0 0 1 12 0", fill: "black", "fill-opacity": ".7" } }] }, wink: { elements: [{ name: "path", type: "element", attributes: { d: "M22 14a6 6 0 1 1-12 0 6 6 0 0 1 12 0", fill: "black", "fill-opacity": ".6" } }, { name: "path", type: "element", attributes: { "fill-rule": "evenodd", "clip-rule": "evenodd", d: "M56.6 16.96c1.59-3.92 5.55-6.86 10.37-7.2 4.8-.33 9.12 2 11.24 5.64.63 1.1-.1 2.06-.93 1.43-2.6-1.93-6.15-3-10-2.73a15 15 0 0 0-9.33 3.9c-.84.79-1.81.11-1.35-1.03", fill: "black", "fill-opacity": ".6" } }] }, winkWacky: { elements: [{ name: "circle", type: "element", attributes: { cx: "68", cy: "14", r: "12", fill: "white" } }, { name: "circle", type: "element", attributes: { cx: "68", cy: "14", r: "6", fill: "black", "fill-opacity": ".7" } }, { name: "path", type: "element", attributes: { "fill-rule": "evenodd", "clip-rule": "evenodd", d: "M2.16 17.45C4.01 13.65 8.16 11 13 11c4.81 0 8.96 2.63 10.82 6.4.55 1.13-.24 2.05-1.03 1.37a15 15 0 0 0-9.8-3.43c-3.73 0-7.12 1.24-9.55 3.23-.9.73-1.82-.01-1.28-1.12", fill: "black", "fill-opacity": ".6" } }] }, xDizzy: { elements: [{ name: "path", type: "element", attributes: { d: "M20.5 22.7 15 17.2l-5.5 5.5c-.4.4-1.1.4-1.6 0l-1.6-1.6c-.4-.4-.4-1.1 0-1.6l5.5-5.5-5.5-5.5c-.4-.5-.4-1.2 0-1.6l1.6-1.6c.4-.4 1.1-.4 1.6 0l5.5 5.5 5.5-5.5c.4-.4 1.1-.4 1.6 0l1.6 1.6c.4.4.4 1.1 0 1.6L18.2 14l5.5 5.5c.4.4.4 1.1 0 1.6l-1.6 1.6c-.4.4-1.1.4-1.6 0m54 0L69 17.2l-5.5 5.5c-.4.4-1.1.4-1.6 0l-1.6-1.6c-.4-.4-.4-1.1 0-1.6l5.5-5.5-5.5-5.5c-.4-.5-.4-1.2 0-1.6l1.6-1.6c.4-.4 1.1-.4 1.6 0l5.5 5.5 5.5-5.5c.4-.4 1.1-.4 1.6 0l1.6 1.6c.4.4.4 1.1 0 1.6L72.2 14l5.5 5.5c.4.4.4 1.1 0 1.6l-1.6 1.6c-.4.4-1.1.4-1.6 0", fill: "black", "fill-opacity": ".6" } }] } } }, facialHair: { width: 121, height: 120, probability: 10, variants: { beardLight: { elements: [{ name: "path", type: "element", attributes: { "fill-rule": "evenodd", "clip-rule": "evenodd", d: "M77.43 72.17c-2.52 2.3-5.2 3.32-8.58 2.6-.58-.12-2.95-4.54-8.85-4.54s-8.27 4.42-8.85 4.54c-3.39.72-6.07-.3-8.58-2.6-4.72-4.31-8.65-10.26-6.3-16.75 1.24-3.38 3.24-7.1 6.88-8.17 3.9-1.15 9.35 0 13.26-.8a8.6 8.6 0 0 0 3.6-1.45 9 9 0 0 0 3.57 1.46c3.92.78 9.38-.36 13.27.79 3.64 1.07 5.64 4.79 6.87 8.17 2.36 6.49-1.57 12.44-6.3 16.75M116.08 0c-3.4 8.4-2.1 18.86-2.72 27.68-.52 7.16-2.02 17.9-8.39 22.53-3.25 2.37-9.18 6.35-13.43 5.24-2.93-.76-3.24-9.16-7.08-12.3a22.4 22.4 0 0 0-15.31-4.9c-2.37.11-7.17.1-9.15 1.91-1.98-1.82-6.78-1.8-9.15-1.9a22.4 22.4 0 0 0-15.3 4.9c-3.85 3.13-4.16 11.53-7.1 12.3-4.24 1.1-10.17-2.88-13.42-5.25-6.37-4.62-7.87-15.37-8.4-22.53C6.02 18.86 7.34 8.4 3.93 0c-1.66 0-.57 16.13-.57 16.13v20.36c.04 15.28 9.59 38.17 30.76 46.9 5.18 2.14 16.89 5.6 25.89 5.6 8.98.02 20.71-3.12 25.9-5.26 21.15-8.73 30.7-31.96 30.74-47.23V16.13S117.74 0 116.08 0", fill: { type: "color", name: "facialHair" } } }] }, beardMajestic: { elements: [{ name: "path", type: "element", attributes: { "fill-rule": "evenodd", "clip-rule": "evenodd", d: "M41.18 51.74c2.18-1.64 15.23-2.26 17.58-3.65q1.09-.65 1.74-1.31.65.67 1.74 1.3c2.35 1.4 15.4 2.02 17.58 3.66 2.21 1.65 3.82 5.44 3.65 8.4-.22 3.57-4.1 12.06-13.8 13.04a12.3 12.3 0 0 0-9.17-3.87 12.3 12.3 0 0 0-9.17 3.87c-9.7-.98-13.58-9.47-13.8-13.03-.17-2.97 1.44-6.76 3.65-8.41M120.85 30c-.38-5.97-1.57-11.85-2.62-17.71-.28-1.58-1.8-12.3-2.5-12.3-.23 9.1-1.03 18.09-2.06 27.15-.3 2.7-.63 5.42-.84 8.13-.18 2.2.13 4.85-.4 6.98-.68 2.7-4.08 5.23-6.73 6.16-6.6 2.33-12.1-7.3-17.74-10.12-7.32-3.66-19.9-4.53-27.38.24-7.64-4.77-20.22-3.9-27.54-.24C27.4 41.11 21.9 50.74 15.3 48.41c-2.65-.93-6.05-3.46-6.73-6.16-.53-2.13-.22-4.78-.4-6.98-.2-2.71-.53-5.42-.84-8.13A308 308 0 0 1 5.27 0c-.7 0-2.22 10.7-2.5 12.29C1.72 18.15.53 24.03.14 29.99q-.58 9.18 1.33 18.17.91 4.3 2.05 8.54c.83 3.15-.32 9.27.05 12.5.7 6.1 3.58 18 6.81 23.25 1.56 2.54 3.4 4.12 5.44 6.17 1.96 1.97 2.78 5.02 4.9 7.12 3.96 3.9 9.73 6.23 15.65 6.8 5.3 4.5 14.14 7.46 24.13 7.46 10 0 18.82-2.95 24.13-7.46 5.92-.57 11.69-2.9 15.64-6.8 2.13-2.1 2.95-5.15 4.91-7.12 2.05-2.05 3.88-3.63 5.44-6.17 3.23-5.25 6.1-17.15 6.8-23.26.38-3.22-.77-9.34.06-12.5q1.14-4.22 2.05-8.53c1.25-6 1.73-12.06 1.33-18.17", fill: { type: "color", name: "facialHair" } } }] }, beardMedium: { elements: [{ name: "path", type: "element", attributes: { "fill-rule": "evenodd", "clip-rule": "evenodd", d: "M60.5 67.84c-11.5.38-16.64 5.88-20.5.29-2.91-4.2-1.7-11.26 1.01-15.23 3.86-5.65 9.1-2.92 14.95-3.56 1.6-.18 3.2-.62 4.54-1.34a13 13 0 0 0 4.55 1.34c5.85.64 11.08-2.09 14.94 3.56 2.72 3.97 3.93 11.03 1.03 15.23-3.87 5.6-9-.67-20.52-.29M116.4 0c-3.43 14.07-5 28.43-7.5 42.67q-.76 4.46-1.68 8.88c-.12.62-.25 2.92-.86 3.21-1.85.9-5.62-3.8-6.63-4.87-2.53-2.67-5.05-5.36-8.13-7.45a43.7 43.7 0 0 0-21.13-7.32c-3.18-.25-7.47.18-10.47 2-3-1.82-7.3-2.25-10.47-2-7.6.6-14.9 3.1-21.13 7.32-3.09 2.1-5.6 4.78-8.13 7.45-1 1.06-4.78 5.76-6.63 4.87-.6-.29-.74-2.6-.86-3.2q-.9-4.44-1.7-8.89C8.62 28.43 7.04 14.07 3.62 0c-1 0-1.87 18.75-1.98 20.5-.46 7.09-.98 14.03-.3 21.13 1.16 12.24 2.37 27.6 11.7 36.96 8.44 8.45 20.68 10.22 31.24 15.55 1.36.69 3.16 1.54 5.1 2.23C51.44 97.93 55.5 99 60.18 99c4.91 0 9.15-1.17 11.08-2.86 1.7-.65 3.27-1.39 4.48-2 10.56-5.33 22.8-7.1 31.24-15.55 9.33-9.36 10.54-24.72 11.7-36.96.68-7.1.16-14.04-.3-21.14-.1-1.77-.98-20.5-1.98-20.5", fill: { type: "color", name: "facialHair" } } }] }, moustacheFancy: { elements: [{ name: "path", type: "element", attributes: { d: "M60 43.3c6.8-3.59 16.42-4.15 21.61-2.17a32 32 0 0 1 4.84 2.55c4.13 2.47 8.55 5.12 14.91 3.15.37-.12.73.2.62.58-1.37 4.5-9 7.6-11.6 7.7-6.2.24-11.75-2.26-17.13-4.7-4.44-2-8.77-3.95-13.25-4.25-4.48.3-8.8 2.26-13.25 4.26-5.38 2.43-10.92 4.93-17.13 4.69-2.6-.1-10.23-3.2-11.6-7.7-.1-.37.25-.7.62-.58 6.36 1.97 10.78-.68 14.9-3.15a32 32 0 0 1 4.85-2.55c5.2-1.98 14.82-1.42 21.6 2.17", fill: { type: "color", name: "facialHair" } } }] }, moustacheMagnum: { elements: [{ name: "path", type: "element", attributes: { d: "M60 40.94c2.5-3.34 12.27-4.75 19.27-3.48 9.66 1.76 13.75 12.3 12.51 14.22-.77 1.19-2.48.8-4.26.38a15 15 0 0 0-2.4-.43c-1.5-.09-3.34.22-5.45.57-4.98.82-11.37 1.88-17.62-1.51A6 6 0 0 1 60 48.8a6 6 0 0 1-2.05 1.86c-6.25 3.4-12.65 2.33-17.63 1.5-2.1-.34-3.96-.65-5.44-.56-.76.05-1.6.24-2.4.43-1.78.4-3.5.8-4.26-.38-1.24-1.91 2.85-12.46 12.5-14.22 7.01-1.27 16.78.14 19.28 3.48", fill: { type: "color", name: "facialHair" } } }] } } }, mouth: { width: 92, height: 38, variants: { concerned: { elements: [{ name: "path", type: "element", attributes: { "fill-rule": "evenodd", "clip-rule": "evenodd", d: "M27.12 23.87a19 19 0 0 1 37.77.09c.08.77-.77 2.04-1.85 2.04H29.1c-1.1 0-2.1-1.18-1.98-2.13", fill: "black", "fill-opacity": ".7" } }, { name: "path", type: "element", attributes: { d: "M61.59 26H30.4A11 11 0 0 1 46 19.2 11 11 0 0 1 61.6 26", fill: "#FF4F6D" } }, { name: "path", type: "element", attributes: { d: "M58.57 11.75A5 5 0 0 1 57 12H36q-1.22-.02-2.24-.53A19 19 0 0 1 46 7c4.82 0 9.22 1.8 12.57 4.75", fill: "white" } }] }, default: { elements: [{ name: "path", type: "element", attributes: { "fill-rule": "evenodd", "clip-rule": "evenodd", d: "M32 9a14 14 0 1 0 28 0", fill: "black", "fill-opacity": ".7" } }] }, disbelief: { elements: [{ name: "path", type: "element", attributes: { "fill-rule": "evenodd", "clip-rule": "evenodd", d: "M32 23a14 14 0 1 1 28 0", fill: "black", "fill-opacity": ".7" } }] }, eating: { elements: [{ name: "path", type: "element", attributes: { d: "M20 20.24q2.05.75 4.4.76c5.31 0 9.81-3.15 11.29-7.49 2.47 2.16 6.17 3.53 10.31 3.53s7.84-1.37 10.31-3.53C57.8 17.85 62.3 21 67.61 21q2.34-.01 4.4-.76h-.19c-6.33 0-11.8-4.9-11.8-10.56 0-4.18 2.32-7.72 5.7-9.68-5.5.8-9.74 5-9.9 10.1a17.6 17.6 0 0 1-9.8 2.8 17.5 17.5 0 0 1-9.8-2.8C36 5 31.8.8 26.3 0a11.2 11.2 0 0 1 5.68 9.68c0 5.66-5.47 10.57-11.8 10.57z", fill: "black", "fill-opacity": ".6", opacity: ".6" } }, { name: "path", type: "element", attributes: { d: "M9 18A9 9 0 1 0 9 0a9 9 0 0 0 0 18m74 0a9 9 0 1 0 0-18 9 9 0 0 0 0 18", fill: "#FF4646", "fill-opacity": ".2" } }] }, grimace: { elements: [{ name: "rect", type: "element", attributes: { x: "14", y: "1", width: "64", height: "26", rx: "13", fill: "black", "fill-opacity": ".6" } }, { name: "rect", type: "element", attributes: { x: "16", y: "3", width: "60", height: "22", rx: "11", fill: "white" } }, { name: "path", type: "element", attributes: { d: "M16.18 12H24V3.41A11 11 0 0 1 27 3h1v9h9V3h4v9h9V3h4v9h9V3h2q1.02 0 2 .18V12h8.82l.05.28v3.44l-.05.28H67v8.82q-.98.18-2 .18h-2v-9h-9v9h-4v-9h-9v9h-4v-9h-9v9h-1a11 11 0 0 1-3-.41V16h-7.82a11 11 0 0 1 0-4", fill: "#E6E6E6" } }] }, sad: { elements: [{ name: "path", type: "element", attributes: { "fill-rule": "evenodd", "clip-rule": "evenodd", d: "M32.06 21.72C32.7 14.7 38.7 10 46 10c7.34 0 13.36 4.75 13.95 11.85.03.38-.87.67-1.32.45Q50.32 18.14 46 18.14q-4.27 0-12.45 4.07c-.5.25-1.53-.07-1.5-.49", fill: "black", "fill-opacity": ".7" } }] }, screamOpen: { elements: [{ name: "path", type: "element", attributes: { "fill-rule": "evenodd", "clip-rule": "evenodd", d: "M26 32.86C27.14 18.88 30.24 7 46 7s18.92 11.94 20 26c.08 1.12-.83 2-1.96 2-6.69 0-9.37-2-18.05-2-8.7 0-13.26 2-17.9 2-1.17 0-2.2-.74-2.1-2.14", fill: "black", "fill-opacity": ".7" } }, { name: "path", type: "element", attributes: { d: "M59.02 11.57Q58.1 12 57 12H36c-.98 0-1.9-.28-2.67-.77C36.23 8.57 40.28 7 46 7c5.95 0 10.1 1.7 13.02 4.57", fill: "white" } }, { name: "path", type: "element", attributes: { d: "M61.8 34.92a44 44 0 0 1-5.54-.82c-2.73-.53-5.65-1.1-10.27-1.1-5.01 0-8.65.66-11.73 1.23-1.45.26-2.77.5-4.06.65A11 11 0 0 1 46 27.2a11 11 0 0 1 15.8 7.72", fill: "#FF4F6D" } }] }, serious: { elements: [{ name: "rect", type: "element", attributes: { x: "34", y: "12", width: "24", height: "6", rx: "3", fill: "black", "fill-opacity": ".7" } }] }, smile: { elements: [{ name: "path", type: "element", attributes: { "fill-rule": "evenodd", "clip-rule": "evenodd", d: "M27.12 9.13a19 19 0 0 0 37.77-.09c.08-.77-.77-2.04-1.85-2.04H29.1C28 7 27 8.18 27.12 9.13", fill: "black", "fill-opacity": ".7" } }, { name: "path", type: "element", attributes: { d: "M62 7H31a5 5 0 0 0 5 5h21a5 5 0 0 0 5-5", fill: "white" } }, { name: "path", type: "element", attributes: { d: "M58.7 21.14A11 11 0 0 0 46 19.2a10.95 10.95 0 0 0-12.7 1.94A19 19 0 0 0 46 26c4.88 0 9.33-1.84 12.7-4.86", fill: "#FF4F6D" } }] }, tongue: { elements: [{ name: "path", type: "element", attributes: { "fill-rule": "evenodd", "clip-rule": "evenodd", d: "M21 9.6C22.41 19.24 33.06 27 46 27c12.97 0 23.65-7.82 25-18.26.1-.4-.22-1.74-2.17-1.74H23.17c-1.79 0-2.3 1.24-2.17 2.6", fill: "black", "fill-opacity": ".7" } }, { name: "path", type: "element", attributes: { d: "M62 7H31a5 5 0 0 0 5 5h21a5 5 0 0 0 5-5", fill: "white" } }, { name: "path", type: "element", attributes: { d: "M35 17.5v9a11.5 11.5 0 1 0 23 0v-9c0-1.93-2.91-3.5-6.5-3.5-2.01 0-3.8.5-5 1.26a9.5 9.5 0 0 0-5-1.26c-3.59 0-6.5 1.57-6.5 3.5", fill: "#FF4F6D" } }] }, twinkle: { elements: [{ name: "path", type: "element", attributes: { d: "M32 10c0 5.37 6.16 9 14 9s14-3.63 14-9c0-1.1-.95-2-2-2-1.3 0-1.87.9-2 2-1.24 2.94-4.32 4.72-10 5-5.68-.28-8.76-2.06-10-5-.13-1.1-.7-2-2-2-1.05 0-2 .9-2 2", fill: "black", "fill-opacity": ".6" } }] }, vomit: { elements: [{ name: "path", type: "element", attributes: { "fill-rule": "evenodd", "clip-rule": "evenodd", d: "M26 24.4C27.14 13.9 30.24 5 46 5s18.92 8.96 20 19.5c.08.84-.83 1.5-1.96 1.5-6.69 0-9.37-1.5-18.05-1.5-8.7 0-13.25 1.5-17.9 1.5-1.16 0-2.2-.55-2.1-1.6", fill: "black", "fill-opacity": ".7" } }, { name: "path", type: "element", attributes: { d: "M59.86 9.1c-.8.57-1.8.9-2.86.9H36c-1.3 0-2.49-.5-3.38-1.31C35.56 6.39 39.8 5 46 5c6.54 0 10.9 1.54 13.86 4.1", fill: "white" } }, { name: "path", type: "element", attributes: { d: "M34 19a6 6 0 0 0-6 6v7a6 6 0 0 0 12 0v-2h.08a6 6 0 0 1 11.84 0H52a6 6 0 0 0 12 0v-5a6 6 0 0 0-6-6z", fill: "#7BB24B" } }, { name: "path", type: "element", attributes: { d: "M64 25a6 6 0 0 0-6-6H34a6 6 0 0 0-6 6v6a6 6 0 0 0 12 0v-2h.08a6 6 0 0 1 11.84 0H52a6 6 0 0 0 12 0z", fill: "#88C553" } }] } } }, nose: { width: 24, height: 8, variants: { default: { elements: [{ name: "path", type: "element", attributes: { "fill-rule": "evenodd", "clip-rule": "evenodd", d: "M0 0c0 4.42 5.37 8 12 8s12-3.58 12-8", fill: "black", "fill-opacity": ".16" } }] } } }, top: { width: 260, height: 280, probability: 100, variants: { bigHair: { elements: [{ name: "path", type: "element", attributes: { d: "M43.83 105.6q-.59-2.4-1.13-4.92c-1.95-9.23-2.95-20.22 2.89-39.67-6.9 22.99-4.25 34.15-1.76 44.58 1.23 5.2 2.43 10.2 2.37 16.4v-.02c.06-6.2-1.14-11.21-2.37-16.4m173.55 8.64c-.13.4-.16.8-.18 1.23zm-.33 2.58q-.18 1.63-.23 3.35c-29.04-10.76-54.94-29.62-70.32-51.55-12.1 15.62-31.96 23.04-51.63 30.4-17.38 6.5-34.62 12.95-46.2 24.95l1.1-1.5c11-14.6 28.75-21.88 46.7-29.24 18.81-7.71 37.81-15.5 49.38-31.9 15.4 24.12 41.82 44.67 71.16 55.65z", fill: "black", "fill-opacity": ".16" } }, { name: "path", type: "element", attributes: { d: "M31 280h1v-9a72 72 0 0 1 72-72h4v-18.39a56 56 0 0 1-31.8-45.74A12 12 0 0 1 66 123v-13q0-1.2.22-2.32c9.12-5.82 19.65-10.13 30.24-14.48 18.81-7.71 37.82-15.5 49.39-31.9 11.95 18.7 30.55 35.3 52.02 46.9q.13.89.13 1.8v13a12 12 0 0 1-10.2 11.87A56 56 0 0 1 156 180.6V199h4a72 72 0 0 1 72 72v9c24.41-13.94 15.86-33.21 6.28-48.46a303 303 0 0 0-4.07-6.27c-3.48-5.25-6.45-9.74-7.2-12.97q-.16-.7-.18-1.3c-.14-4.62 3.14-7.84 7.16-11.78 6.22-6.08 14.18-13.9 14.01-31.22-.51-15.83-9.8-22.25-18.1-28-6.93-4.78-13.17-9.1-13.1-18q0-2.72.25-5.2c.11-.4.13-.82.15-1.24v-.1c.45-3.44 1.2-6.62 1.98-9.87 2.55-10.72 5.3-22.23-2.38-46.6-2.9-9.11-6.97-16.5-12.1-22.45-14.12-16.42-36.35-22.04-64.9-23.3q-3.82-.16-7.8-.22V13h-1c-43.08.77-73.16 9.54-84.8 46-7.67 24.36-4.93 35.87-2.37 46.6 1.23 5.19 2.43 10.2 2.37 16.4.03 3.75-1.06 6.7-2.85 9.2-2.46 3.43-6.23 6.04-10.24 8.8-8.3 5.75-17.6 12.17-18.1 28-.15 17.33 7.8 25.14 14.03 31.22 4.03 3.94 7.32 7.16 7.17 11.78-.08 3.26-3.4 8.27-7.38 14.27-10.54 15.9-25.7 38.8 2.2 54.73", fill: { type: "color", name: "hair" } } }, { name: "path", type: "element", attributes: { "fill-rule": "evenodd", "clip-rule": "evenodd", d: "M49.58 122.45c22.54-29.92 73.49-29.13 96.09-61.15 15.4 24.1 41.82 44.65 71.16 55.63.3-.86.08-1.85.37-2.7 2.15-14.14 9.14-24.37-.58-55.23-11.63-36.46-41.71-45.23-84.8-45.98l-1-.02c-43.08.77-73.16 9.54-84.8 46-11.38 36.16.17 44 0 63a15 15 0 0 1-2.85 9.2c.19.4 4.16-5.76 6.4-8.75", fill: "white", "fill-opacity": ".2" } }] }, bob: { elements: [{ name: "path", type: "element", attributes: { d: "M39 145c-.62-30.84 28.32-95.2 39-108 7.92-9.5 29.7-17.45 54-17s46.86 5.81 55 16c12.32 15.43 37.87 74.08 38 109 .1 24.8-9.54 49.66-23 51-7.6.76-17.26-.23-28.86-1.4-5.3-.55-11.02-1.13-17.14-1.6v-12.4a56 56 0 0 0 32-50.6v-28.44a130 130 0 0 1-26.9-19.88c3.35 6.24 7.19 11.9 11.51 16.2-30.54-8.59-51.7-26.16-64.35-39.94C102.4 69.02 91.97 85.24 76 97.57V130a56 56 0 0 0 32 50.61v13.14c-6.94.95-13.4 2.16-19.35 3.27-10.85 2.02-19.98 3.73-27.26 2.98-14.22-1.47-21.88-30.2-22.38-55", fill: { type: "color", name: "hair" } } }] }, bun: { elements: [{ name: "path", type: "element", attributes: { d: "M150.12 28.28c3.06-2.97 4.88-6.71 4.88-10.78C155 7.84 144.7 0 132 0s-23 7.84-23 17.5c0 4.1 1.85 7.86 4.94 10.84q-1.48.33-2.9.69c-15.1 3.8-24.02 14.62-31.68 30.62a68 68 0 0 0-6.34 25.83 34 34 0 0 0 1.25 10.22c.33 1.2 2.15 5.39 2.65 2 .1-.66-.07-1.47-.24-2.27q-.2-.84-.26-1.6c-.08-1.56 0-3.15.1-4.72q.29-4.4 1.66-8.59c1.33-3.98 3.02-8.3 5.6-11.67.97-1.25 1.88-2.7 2.88-4.27 5.63-8.9 13.68-21.6 45.34-22.9 34.3-1.42 46.78 21.66 51.2 29.87q.58 1.06.98 1.75c2.67 4.53 2.78 9.75 2.9 14.91.05 2.71.1 5.41.54 8 .47 2.84 1.54 2.78 2.13.23 1-4.33 1.47-8.83 1.15-13.28-.72-10.05-4.4-36.45-24.6-48.15a66 66 0 0 0-16.18-6.73", fill: { type: "color", name: "hair" } } }] }, curly: { elements: [{ name: "path", type: "element", attributes: { d: "M66 105.02c11.38-.72 24.68-14.4 31.98-33.94A179 179 0 0 0 131 74c12.55 0 24.31-1.16 34.45-3.2 7.38 19.96 21.01 33.87 32.55 34.24V88a66 66 0 0 0-38-59.78A184 184 0 0 0 131 26c-9.2 0-17.99.63-26.01 1.76A66 66 0 0 0 66 88z", fill: "black", "fill-opacity": ".16" } }, { name: "path", type: "element", attributes: { d: "M72 192a48 48 0 0 0 13.6-1.95 72 72 0 0 0 13.68 9.1A73 73 0 0 1 104 199h4v-18.39a56 56 0 0 1-31.8-45.74A12 12 0 0 1 66 123v-13a12 12 0 0 1 10-11.83v-.75c8.46-5.38 16.75-16.36 21.98-30.34A179 179 0 0 0 131 70c12.55 0 24.31-1.16 34.45-3.2 5.31 14.37 13.87 25.6 22.55 30.9v.46q.66.1 1.29.29a24 24 0 0 0 3.23 1.47A12 12 0 0 1 198 110v13a12 12 0 0 1-10.2 11.87A56 56 0 0 1 156 180.6V199h4q2.38 0 4.72.15a72 72 0 0 0 13.69-9.1 48 48 0 0 0 45.19-82.18 44 44 0 0 0-28.37-69.28A44.02 44.02 0 0 0 132 15.9a44.02 44.02 0 0 0-63.23 22.7 44 44 0 0 0-28.37 69.27A48 48 0 0 0 72 192", fill: { type: "color", name: "hair" } } }] }, curvy: { elements: [{ name: "path", type: "element", attributes: { d: "M88.4 84.2c-4.88 1.3-9.65 2.78-14.4 4.34-11.13 3.64-6.68-6.1-3-14.04l111.79-9.52c6 7.33 24.8 41 7.1 27-3.1-2.45-9.6-4.45-12.7-7.27-2.37-2.12-5.19-1.78-6.3-4.48l-2.56.9a375 375 0 0 1-11.97-4.12l-.56-.97-1.67.63-9.13-.33c-2.62-.03-13.72.22-16.27.43 0 0-1.23-.93-2.94-2.69l-1.35 3.22s-11.93 1.8-14.09 1.96l-1.06-1.95-2.74 2.97c-3.9.9-13.84 2.83-18.3 4.01", fill: "black", "fill-opacity": ".16" } }, { name: "path", type: "element", attributes: { d: "M47.6 123.04c-5.7-17.86 2.75-37.13 11.12-47.27 1.48-1.8 3.06-5.1 5.06-9.3 8.34-17.47 23.9-50.05 69.8-50.27 49.93-.24 59.75 36.02 63.66 50.43 1.64 6.08 4.55 11.6 7.38 17.21 4 8 8.4 16.74 9.9 23.05 1.09 4.54 1.7 9.05 1.17 13.7-.12 1.06-1.08 4.22-.48 4.85.54.57 1.88 1.15 3.1 1.67 9 3.9 16.1 10.4 19.8 19.62 4.7 11.72-1 25.47-11.26 32.17-1.4.9-.74 2.7-.76 4.1a74 74 0 0 1-4.33 23.5c-1.42 3.94-3.17 7.92-6.53 10.98-2.85 2.58-6.94 4.42-10.86 5.52-1.35.38-1.33.78-1.41 1.17-1.15 5.76 2.7 13.12 4.6 18.56 1.5 4.29 3 8.59 3.8 13 1.18 6.42-3.02 27.82-14.12 22.8 5.52-2.64 5.76-8.26 3.88-9.84-4.34-3.62-11.76-1.59-16.9-.74-3.7.61-7.63 1.25-11.15.43a31 31 0 0 1-10.6-4.84c-17.65-13.97-13.84-37.04 1.07-64.4l-.55-.03c-1.1.04-1.67 0-3 0h-4v-18.4a56 56 0 0 0 32-50.62V92q0-2.21-.15-4.38a68 68 0 0 0-3.66-1.86c-2.58-1.24-5.24-2.53-6.91-4.05a10 10 0 0 0-3-1.76c-1.4-.6-2.62-1.14-3.28-2.72l-2.55.9a374 374 0 0 1-11.97-4.12l-.55-.97-1.67.63-9.12-.33c-2.63-.03-13.73.22-16.28.43 0 0-1.23-.93-2.94-2.69l-1.33 3.22s-11.92 1.8-14.08 1.96l-1.06-1.95-2.74 2.97c-1.43.33-3.66.8-6.13 1.31-4.3.9-9.34 1.95-12.17 2.7a248 248 0 0 0-11.93 3.53Q76 88.3 76 92v38a56 56 0 0 0 32 50.61V199h-4a72 72 0 0 0-16.4 1.87l-.32.5c-4.78 6.95-13.87 12.39-17.46 19.5-1.47 2.9.19 7.82 1.66 10.55 3.2 5.9 11.15 8.66 19.52 7.33-2.53 2.12-7.55 3.82-10.95 3.94-4.63.17-10.3-1.62-14.26-3.58.6 3.7 2.68 5.72 4.62 8.7-5.52-.28-10.88-7.06-12.68-12.05-2.2 4.51-3.44 16.64-2.35 20.03-14.14-6.34-25.13-19.44-24.3-35.66.54-10.56 7.15-18.9 9.48-28.9.46-1.96.14-2.38-1.05-3.94l-.05-.07c-4.38-5.73-9.62-10.69-12.43-17.48-2.54-6.13-2.63-13.18-.64-19.5 2.2-7.08 9.06-14.16 14.84-20.14a106 106 0 0 0 6.37-6.95", fill: { type: "color", name: "hair" } } }, { name: "path", type: "element", attributes: { d: "m163.5 199.2.26-.06s4.44-9.02 11.25-17.38c-1.33-10.43 5.86-23.71 5.86-23.71l-.35-.08A56.3 56.3 0 0 1 156 180.62V199h4c1.32 0 1.88.04 3 .1l.54.04zm-82.23-45.46-.14.06c6.02 9.99 13.63 36.95 6.55 46.66l.25.34A72 72 0 0 1 104 199h4v-18.39a56.2 56.2 0 0 1-26.73-26.87", fill: "black", "fill-opacity": ".24" } }, { name: "path", type: "element", attributes: { d: "M117.38 50.37c1.51-1.85 2.89-3.83 3.5-6.16.23-.8.47-1.7.89-2.3a92 92 0 0 0-12.3 15.7c.77-1 2.73-2 3.76-2.9a35 35 0 0 0 4.15-4.24m53.12-8.4c-.3 3.5.47 6.93.63 10.4 0-.35.34-.93.65-1.48a7 7 0 0 0 .92-4.42c-.14-1-.55-1.95-1.07-2.85-.2-.36-1.12-1.33-1.12-1.66m-115.1 78.4a89 89 0 0 0 4.46 18c2.06 5.71 4.42 11.45 7.8 16.68 3.17 4.87 6.93 9.42 9.96 14.36-.46-.55-1.22-1.17-1.9-1.73-.5-.4-.94-.76-1.2-1.05-3.23-3.39-5.82-7.19-8.3-11.03-3.24-5.07-5.68-10.58-7.8-16.08-4.13-10.78-8.3-23.85-4.7-35.24-.2.77.5 2.43.6 3.2.63 4.26.49 8.6 1.08 12.87m-1.64-16.17-.02.1zm23.86 65.23c.5.58.35.56 0 0m-9.77-4.4c-2.46-3.53-5.05-7.15-7.09-10.9-1.78-3.26-3.05-6.84-5.3-9.84-.31-.44-.71-.97-.8-1.32.69 6.15 3.46 12.74 7.74 17.3 1.56 1.66 4.1 3.03 5.45 4.76m-4.78 6.28c3.55 3.82 6.94 7.76 9.45 12.18 1.75 3.07 3.22 6.64 3.46 10.21.04.53.08 1.2.2 1.57-2.22-4.29-3.91-8.83-6.55-12.94-2.6-4.05-5.95-7.78-9.44-11.28-3.7-3.7-7.41-7.18-9.4-11.85a25.5 25.5 0 0 1-1.99-12.55c.12 1.24.86 2.82 1.54 4.28 1.47 3.14 2.07 6.6 3.67 9.7 2.13 4.08 5.96 7.24 9.17 10.68m-4.86 2.86c-.5-.5-2.4-1.7-2.75-2.3l-.03-.07.03.06c.7 1.5 1.48 2.92 2.22 4.4 1.53 3.08 3.7 5.71 5.93 8.4l1.08 1.3c-.8-1.02-1.02-3.29-1.53-4.5a21 21 0 0 0-4.94-7.33M48 180.52a84 84 0 0 0 3.73 5.02c1.9 2.43 3.8 4.86 5.26 7.5 2.83 5.2 4.07 10.81 4.32 16.55.12 2.7.12 5.46-.25 8.16-.24 1.77-.54 3.6-1.22 5.25-.25.6-.54 1.32-.63 1.84-.06-2.32-.03-4.64 0-6.95.13-8.2.25-16.3-4.02-23.99-1.58-2.83-3.68-5.4-5.78-7.99a90 90 0 0 1-3.9-5.02c-2.78-3.96-5.5-7.85-7.72-12.08 1.36 1.72 3.8 3.07 5.32 4.77 1.9 2.13 3.35 4.58 4.9 6.9m11.2 44.33c-.1.53 0 .4 0 0M49.54 204l.02-1.5c0 .5.82 1.51 1.04 2.03a14.4 14.4 0 0 1 .09 11.32c-1.9 4.9-4.9 9.25-8.64 13.3.83-1.09 1.35-2.6 1.85-4.06 1.01-2.94 2.6-5.62 3.8-8.49 1.7-4.01 1.74-8.32 1.82-12.6m-8.6 17.2a9.5 9.5 0 0 0 2.24-4.13c.2-.9-.4-2.68 0-3.38a14 14 0 0 0-1.85 3.64c-.19.69.01 3.32-.39 3.87M83.86 64.32a63 63 0 0 0 9.77-11.2 35 35 0 0 0 3.22-5.6c.13-.28.3-.87.48-1.54.3-1.1.65-2.4 1.04-2.97-2.7 2.9-4.84 6-7.03 9.17-1.45 2.12-2.99 4.18-4.34 6.37-.36.58-.68 1.35-1.03 2.14-.59 1.37-1.22 2.83-2.1 3.63m-1.03-8.63c.14-.62.27-1.22.47-1.57.75-1.32 1.9-2.45 3.18-3.41-.4.3-.6 1.2-.8 2-.2.57-.3 1.08-.5 1.36A16 16 0 0 1 82 57.8c.36-.35.56-1.22.74-2.04M82 57.82l.03-.01zm120.78 92.81c.6-3.33 1.24-6.84 2.93-9.84a45 45 0 0 1 2.6-3.98q.73-1.04 1.35-2.12c.66-1.16 1.46-2.56 2.26-3.03-4.16 2.43-7.42 5.54-9.16 9.64a14 14 0 0 0-1.09 6.38c.08 1.57.76 3.24.77 4.77q.13-.92.32-1.85M201 130.48a23 23 0 0 1-1 3.63 25 25 0 0 1-1.77 3.8c-.43.78-1.98 2.35-1.98 3.18-.09-4.9 1.73-9.33 5.17-13.25-.38.65-.28 2.03-.42 2.74m-.8 35.23c2.28-.03 4.82 2.52 6.51 4.22 2.5 2.43 5.2 4.56 7.2 7.3l.1.07v-.07c-.68-.97-.7-2.75-1.23-3.86-.72-1.5-1.82-2.9-3.06-4.13-2.32-2.3-5.77-4.07-9.42-3.55m-.81 10.38c-.17-.05-1.77-.5-2.27-.34.6-.26 1.3-.57 1.94-.65 4.28-.56 9.5 3.15 10.07 6.73-.47-1.23-3.02-2.24-4.17-2.85-1.82-.97-3.56-2.14-5.54-2.87m-2.28-.34-.06.03.04-.02zm4.1 8.15a7.6 7.6 0 0 0-3.8-.13c-.47.13-1.44.42-1.56.39 2.82.67 5.47.99 8.4.92-.44 0-1.16-.34-1.84-.66-.47-.22-.9-.43-1.21-.5m-11.22 13.85q-.2 0 0 0m0 0c4.26-.22 9.25.4 13.3 1.42a22 22 0 0 1 5.7 2.3c1.4.8 3.94 1.93 4.88 3.13-3.75-6.43-11.86-9.78-20.17-8.12-1.06.22-2.67 1.2-3.7 1.29m1.74 12.5c3.22.42 6.54-.07 9.76-.44 1.39-.16 3.04-.87 4.39-.51a24 24 0 0 0-8.4-1.17c-2.93.13-5.9 1.06-8.6 2.03.69-.2 1.82-.06 2.85.07m-13.4 10.4c-.06 2.23-.04 4.52.1 6.74.25 3.97 2.55 7.44 5.93 10.08a32 32 0 0 0 4.33 2.72c2.5 1.39 5 2.76 6.63 5.1a10.5 10.5 0 0 1 .82 10.36 5 5 0 0 0-.51 1.58v-.05c.03-3.87.07-8.36-2.64-11.6-1.6-1.91-3.87-3.11-6.16-4.31a27 27 0 0 1-4.68-2.82c-3.3-2.64-5.8-6.1-6.35-9.98-.45-3.13-.23-8.58 2.98-10.73-.6.44-.48 2.34-.5 2.89m.55-2.93-.07.03zM176 242.75l.08.08zm11.15 12.85c-.2-5.11-3.7-8.96-7.94-11.34-.6-.34-2.6-.93-3.13-1.43 2.96 3.24 6.32 6.2 8.96 9.73.46.6 2.06 2.3 2.1 3.04m.04.03v-.03zm41.04-101.75a12 12 0 0 1 2.67 3.7 12.6 12.6 0 0 1 .6 10c.15-.52-.14-1.47-.37-2.22-.55-1.76-1.07-3.5-1.76-5.22-1.2-2.91-2.15-5.64-4.2-8.2.55.67 2.33 1.3 3.06 1.93m-50.02-105a5.7 5.7 0 0 1-.95 3.75c.1-.2-.12-1.1-.28-1.84-.34-1.46-.14-2.95-.04-4.46 0 .64 1.18 1.77 1.3 2.57m-51.6 1.26a8.5 8.5 0 0 1-3.3 2.78c.59-.33 1.1-2 1.55-2.55.73-.94 1.63-1.84 2.58-2.63-.2.22-.6 2.05-.82 2.4", fill: "white", "fill-opacity": ".6" } }] }, dreads: { elements: [{ name: "path", type: "element", attributes: { d: "M241.14 168.86c4.83 6.8 11.1 14 12.24 22.06.45 3.2.7 16.23-7.54 11.43-.27 4.36-.97 4.98.34 9.2.88 2.86 2.08 8.62-3.87 8.1 2.26 6.17 5.88 14.76 2.48 21.16-5.58 10.51-11.89-2.74-13.57-7.49.1 3.28-3.42 9.2-7.84 4.63.35 5.42 2.52 13.78-.66 18.86-6.16 9.85-12.97-2.62-13.2-7.9-1.11 3.56-.28 12.14-7.6 10.15-6.32-1.71-4.03-10.09-2.8-13.87-2.02 3.56-4.5 8.85-4.88 12.87-.34 3.45 2.94 11.57-5.55 10.05-6.52-1.17-6.76-10.9-6.65-15.18.1-3.48 3.46-11.43 1.18-14.25-12.73 5.34.6 23.3-10.95 27.3-3.84 1.32-7.04-1.18-8.32-4.64q.6-2.55-2.28-2.6c-1.2-1.49-2-1.44-2.8-3.66-2.31-6.52 2.2-15.19 5.43-21-3.35 3.05-6.05 7.25-9.7 9.91-2.45 1.8-6.08 2.31-8.37-.17-2.52-2.73-.14-5.34 1.21-7.82 3-5.49 7.73-8.68 12.67-13.08 4.36-3.85 8.22-8.18 12.04-12.37 2.57-2.8 5.01-5.8 7.06-8.97A72 72 0 0 0 160 199h-4v-18.39a56.2 56.2 0 0 0 25.8-24.98c.1-3.28.28-7.1.47-11.2.54-12.09 1.19-26.4.48-35.34l-.2-2.58c-1.12-14.36-1.8-23.03-12-36.06-4.56-5.83-13.18-7.67-21.72-9.5-8.09-1.73-16.1-3.45-20.51-8.5-4.13 4.77-10.14 7.31-16.74 8.98q-2.18.54-4.34.96c-4.98 1.03-9.7 2-13.08 5.6-7.8 8.32-11.23 13.88-13.62 24.26A117 117 0 0 0 78 126.83q.18 2.82.32 5.69c.35 7.1.71 14.32 2.9 21.1a56.2 56.2 0 0 0 26.78 27V199h-4q-1.66 0-3.28.07c.67 3.44 1.09 6.93.81 10.34-.4 5-1.34 9.66-.85 14.7 1.04 10.55 5.41 20.5 9.02 30.55 1.73 4.82 9.36 10.49 6.23 14.46s-13.81-5.47-16.2-10.05c-2.44-4.66-4.65-9.4-7.18-14.03 1.48 6.46 2.77 13.1 4.8 19.4 1.36 4.29 3.43 10.74-2.28 11.96-8.95 1.9-9.3-12.58-10.18-16.9-1.47-7.2-3.1-9.98-5.5-16.97-.49 5.34.34 10.9-.8 16.2-.7 3.19-4.37 5.83-6.57 8.53-7.53 9.28-9.32-6.28-11.23-10.55-3.3 2.4-10.5 7.16-14.9 4.14-3.26-2.23-1.2-6.27-.44-9.03 1.22-4.44 1.94-8.84-1.3-12.86-3.1 3-9.93 4.75-13.89 1.88-5-3.63-.62-8.94 1.63-12.7 4.33-7.26 4.07-15.87 5.44-23.94.46-2.7 1.06-6.26.3-8.12-1.1-2.68-2.3-2.7-4.74-2.1-3.45.87-6.29 2.8-6.87 5.58-.84 4.03 3.57 5.62 3.93 9.12.77 7.55-8.7 4-11.53.62-6.95-8.36-1.26-18.23 4.21-25.56 1.87-2.5 2.4-3.22 2.02-6.48-.77-6.41-2.5-12.18-1.88-18.72.86-8.97 4.3-17.44 9.35-24.82 3.46-5.06 5.3-9.45 5.8-15.57 1.4-17.4 7.31-35.28 15.04-50.74 3.97-7.93 7.96-16.5 14.83-22.4 2.23-1.91 6.24-2.8 8.17-4.65 3.56-3.43.44-9.5 4.95-13.4 3.78-3.24 8.17-2.16 12.28-3.92 4.21-1.81 5.11-7.42 10.21-8.61 5.16-1.2 9.29 2.18 13.66 3.8 6.43 2.38 10.45 1.69 16.76-.3l.08-.03c4.2-1.33 6.95-2.2 10.89.1 2.52 1.5 4.5 5.95 7.62 6.37 3.8.52 9.14-3.04 13.35-2.9 6.45.2 9.6 4.24 12.25 8.55 1.55 2.5 4.4 3.67 6.1 6.15.62.9 1.24 1.8 2.13 2.6 6.31 5.78 14.58 10.26 21.37 15.69 12.66 10.15 15.66 23.88 16.48 37.83.67 11.18-.36 24.3 6.75 34.3 3.71 5.23 7.82 9.74 10.02 15.86.78 2.19 1.85 5.2.51 7.12-1.8 2.58-6.36 2.6-8.3.14-1.9 5.87 4.56 14.35 8.02 19.22", fill: { type: "color", name: "hair" } } }, { name: "path", type: "element", attributes: { d: "M181.5 156.2c-.07 3 0 5.98.38 8.86.33 2.5.84 4.91 1.34 7.31 1.13 5.33 2.23 10.56 1.3 16.27-.75 4.53-2.73 8.87-5.36 12.94A72 72 0 0 0 160 199h-4v-18.39a56.2 56.2 0 0 0 25.5-24.4m-80.78 42.86c-.36-1.85-.8-3.68-1.23-5.48-2.14-8.82-6.42-16.63-10.77-24.55a256 256 0 0 1-5.56-10.53 37 37 0 0 1-1.95-4.89 56.2 56.2 0 0 0 26.8 27V199h-4q-1.63 0-3.25.07", fill: "black", "fill-opacity": ".24" } }, { name: "path", type: "element", attributes: { d: "M101.48 33.5c-1.67 0-12.16 4.75-8.24 6.16 2.4.86 12.5-6.15 8.24-6.15m68.57 13.85q-1.27.56.04 1.07 1.27-.57-.04-1.07m24.46 18.24a27 27 0 0 0-1.37-2.76c-.89-1.27-6.24-8.4-2.47-7.5 2.08.48 4.9 6.17 6.15 8.74.78 1.57 4.28 7.12.72 6.75-.63-.07-1.95-2.92-3.03-5.23m8.51 45.15c-.15-1.17.25-4.76-2.46-3.42-1.8.9.67 11.72.82 13.13l.46 3.95v.03c.6 6.07 1.42 12.1 1.33 18.23 0 .76-1.2 6.66 1.55 5.4 1.46-.66.78-8.74.57-11.2-.74-8.72-1.1-17.46-2.27-26.12m-138.66 11.5c.08 1.58-.7 9.75 1.43 9.8 1.83.04 1.24-8.4 1-11.83-.08-1.08-.08-11.14-2.1-9.9-2.35 1.4-.49 9.51-.37 11.93M72.8 180c0-1.43.82-14.45-1.9-11.38-1.37 1.54-.48 7.02-.35 8.88.05.7-.52 2.86.41 3.19.76.26 1.83.32 1.84-.7m-25.68 13.17c1.93-.05.14-37.83-2.82-37.79-2.08.03 1.36 37.83 2.82 37.8m2.23 19.35c-2.4 0-1.95 8.46-.54 9.13 2.14 1.03 3.23-9.13.54-9.13m15.24 3.54c.02 1.05-1.18 1.07-1.98.74-.72-.3-.63-2.31-.58-3.49.05-1.1-.15-2.2-.3-3.29-.5-3.38-1.27-8.48.03-9.65 1.98-1.78 2.02.17 2.55 1.5 1.56 3.9.2 10.03.28 14.19m137.43-46.47c-2.53-.5-3.85 8.1-2.7 9.01 1.92 1.53 5.35-8.49 2.7-9.01m-.26 37.8c-1.14-.23-9.44 15.73-8.76 16.63 1.3 1.72 12.83-15.82 8.75-16.64m-20.42 7.38c-1.78-.8-9.33 10.75-7.4 11.62 1.75.78 9.56-10.65 7.4-11.62m42.1-43.31c-2.16 0-2.06 11.82-.4 12.56 1.7.78 2.94-12.56.4-12.56M82.51 54.2c1.26-.65 5.45-.87 3.1 1.29-2 1.84-9.53 12.51-12.12 12.62-4.22.18 2.6-7.24 4.76-9.6 1.33-1.45 2.5-3.41 4.26-4.32m-24.26 29.8c-2.18-.44-5.83 10.26-4.56 11.55 1.93 1.95 7.01-11.07 4.56-11.56M80.4 201.85c.48-2.6 2.38-.2 2.8 1.14.4 1.34 4.62 11.08 3.56 12.36-1.63 1.97-2.34-1.37-2.9-2.57-1.31-2.83-3.92-8.43-3.46-10.93M75 225.82c-2.31 0-2.04 9.8-.68 10.38 2.12.9 3.48-10.38.67-10.38m156.82-21.94a58 58 0 0 1 4.98 13.57c.14.6 2.06 5.56-.66 4.84-1.56-.41-1.8-4.78-2.2-6.1a33 33 0 0 0-2.58-5.56c-1.41-2.63-2.85-5.31-3.06-7.64-.33-3.9 1.84-2.42 3.52.89m-14.72 13.07c-2.13 0-2.24 10.77-.9 11.4 1.86.88 3.62-11.4.9-11.4m6.16-88.3c1.58-.4-3.4-13.32-5.18-13.18-2.7.22 2.78 13.8 5.18 13.18m-26.82 56.1q-1.27.57.05 1.07 1.27-.57-.05-1.07m-24.21 55.24c.79 0 1.12-1.23-.06-1.25-.77 0-1.18 1.25.06 1.25m-98.54-55.36c.03-1.9-2.46-.5-2.45 1.1.03 3.21 2.4 1.75 2.45-1.1m-6.16-47.75c-.8 0-1.13 1.24.05 1.27.78 0 1.2-1.27-.05-1.27m-20.74 62.56c-.1 0 1.53-1.99 1.6-.05.07 1.47-1.31.06-1.6.05M52.6 98.06c-2.37 0-2.02 5.76-.51 6.13 2.52.61 2.86-6.13.5-6.13m12.62 124.27c-2.28 0-2.44 7.8-.86 8.3 2.45.75 3.24-8.3.86-8.3m-18.75 5.6q-1.3.6.04 1.1 1.3-.58-.04-1.1m170 3.35c-2.32 0-2.23 9.56-.8 10.2 1.98.9 3.48-10.2.8-10.2m-23.51 8.88c-2.4-.48-3.68 7.4-2.55 8.3 1.85 1.45 5.02-7.8 2.55-8.3m-20.48 7.29c-2 0-1.5 3.58-.36 4.1 2.02.93 2.62-4.1.41-4.1", fill: "white", "fill-opacity": ".3" } }] }, dreads01: { elements: [{ name: "g", type: "element", attributes: { fill: { type: "color", name: "hair" } }, children: [{ name: "path", type: "element", attributes: { d: "M186.7 56.12c.9 3.25 2.17 11.95-.06 14.84-.75.96-5.84-1.74-7.97-2.92l-3.53-1.96c-14.92-8.32-19.74-11-45.9-10.62-28.11.4-47.37 13.58-48.46 14.93-.75.93-1.71 3.44-2.5 10.41-.25 2.2-.32 4.97-.4 7.71-.14 5.98-.3 11.8-2.25 11.8-2.44-.01-2.97-23.78-1.92-33.21q.06-.55.18-1.23c.23-1.4.5-3.13.16-4.11-.16-.44-.54-.7-.94-1-.62-.42-1.26-.87-1.08-2.02.2-1.3 1.1-1.42 1.97-1.55.57-.08 1.13-.16 1.5-.56 1.13-1.23.46-1.87-.31-2.6-.46-.43-.95-.9-1.12-1.53-.63-2.36 1.03-3.1 2.69-3.83l.38-.17c.69-.3 1.1-.42 1.42-.5.6-.15.85-.21 1.89-1.35-2.14-1.56-2.9-3.7 0-4.83.57-.22 1.53-.2 2.5-.2 1.2.02 2.4.03 2.95-.37.15-.11.24-.53.33-.9.06-.27.1-.5.18-.6 1.35-1.93 1.23-3.4 1.08-5.4l-.07-.92c-.13-2.04-.11-3.9 2.33-4.11 1-.08 1.9.4 2.77.86.54.29 1.08.58 1.64.73.87.23 1.1.43 1.32.43.19 0 .37-.15.96-.55 1.18-.82 1.3-2.05 1.43-3.3.1-1.08.22-2.18 1.04-3 1.58-1.6 2.8-.64 4 .3.64.5 1.28 1 1.96 1.1 2.55.36 3.06-1.06 3.62-2.6.32-1 .69-2.05 1.69-2.67 1.84-1.15 2.65-.05 3.44 1 .5.69.98 1.34 1.7 1.4 1 .09 2.52-1.1 3.85-2.13a12 12 0 0 1 2.1-1.44c2.28-.93 3.92.07 5.59 1.08 1.4.86 2.83 1.73 4.65 1.44l.83-.13c2.24-.37 3.1-.51 5.45.96a4.2 4.2 0 0 0 3.74.69c.6-.12 1.3-.25 2.26-.26 1.1 0 1.98.5 2.83.99.7.4 1.36.79 2.13.87.42.04.84-.16 1.26-.36s.84-.4 1.3-.38c1.83.09 2.69 1.49 3.55 2.87.65 1.08 1.32 2.15 2.44 2.66 1.62.72 3.44.24 5.17-.21.79-.2 1.55-.4 2.28-.5 3.96-.46 3.27 1.97 2.55 4.56a11 11 0 0 0-.6 3.26c1.15.27 2.3-.15 3.46-.57 1.1-.4 2.18-.8 3.27-.6 3.4.58 2.25 4.02 1.44 6.45l-.08.2c.65 0 1.55-.2 2.57-.41 2.85-.6 6.6-1.41 7.77 1.13.47 1.05 0 2.3-.44 3.54a7 7 0 0 0-.6 2.4c.01 1.54.7 2.9 1.4 4.28.44.9.9 1.82 1.16 2.78" } }, { name: "path", type: "element", attributes: { d: "m185.36 73.6.47.33c1.76.99 3.15 10.9 3.22 14.69.04 2.34.08 11.25-2.4 10.48-.75-.23-1.9-4.95-2.06-7.72s-1.74-12.16-4.14-16.49q-.2-.36-.53-.8c-.65-.96-1.44-2.12-.92-2.76.72-.88 1.43-.57 2.26-.2l.44.18c.87.35 2.77 1.68 3.66 2.3" } }] }] }, dreads02: { elements: [{ name: "path", type: "element", attributes: { "fill-rule": "evenodd", "clip-rule": "evenodd", d: "M217.2 107.16a12.2 12.2 0 0 1-6.25-5.56 10 10 0 0 1 1.95-.13c2.27-.02 5.15-.04 4.62-2.87-.57-2.98-5.4-2.07-7.28-1.6a6 6 0 0 1 2.12-.62c1.49-.25 3-.51 3.3-2.33.54-3.18-3.28-3.08-5.07-2.4-.26-2.12 2-3.9 4.14-5.55 1.25-.97 2.45-1.9 3.08-2.85q.2-.3.43-.55c.47-.53.86-.97.3-2.08-1.15-2.35-3.94.32-5.33 1.66l-.37.43c.87-1.63 3.31-8.4 2.94-10.13-.53-2.52-2.33-2.6-3.77-.56-.62.88-.94 2.65-1.23 4.26-.15.81-.29 1.58-.45 2.16-.88-.65-1.4-.7-1.7-.74-.44-.04-.5-.05-.56-1.45-.04-1.02.8-2.7 1.56-4.16.4-.8.8-1.54.97-2.09l.3-.8c.52-1.37 1.23-3.19.64-4.24-1.78-3.15-3.48 1.17-3.94 2.65-.5-2.14.5-3.97 1.53-5.88.6-1.13 1.24-2.3 1.57-3.55.54-2.05 1.97-7.58-.5-8.56s-2.52 2.12-2.54 4.66c0 .93-.02 1.8-.15 2.34l-.03.13c-.37 1.57-.92 3.97-2.1 4.71-.18.11-2.83.34-2.96.2-1.1-1.29.42-3.53 1.74-5.49.76-1.13 1.46-2.17 1.55-2.87.22-1.73-.44-2.82-2.06-2.92-.46-.03-1.09.36-1.59.7-.4.24-.74.45-.9.41-1.06-.23-.35-3.82.18-6.5.2-1.04.38-1.94.42-2.46.15-2-.1-7.17-3.48-4.79l.16-2.06c.15-1.95.3-3.86.57-5.83.05-.37.18-.73.3-1.08.3-.97.61-1.86-.69-2.69-2.16-1.36-3.36 1.5-3.85 3.17-.26.9-.27 1.93-.28 2.95-.04 2.3-.07 4.45-2.87 4.52-3.34.07-2.59-2.42-1.84-4.99.3-1 .6-2 .65-2.88.12-1.74-1-6.42-3.27-3.26-.53.7-.64 2.5-.74 4.2a14 14 0 0 1-.34 2.9c-.56-.25-.37-1.4-.17-2.6s.4-2.45-.08-2.96c-1.5-1.64-2.82-.36-3.94.72-.4.4-.8.8-1.18.97l-.08-1.22-.16-3.12c-.03-.7.1-1.69.22-2.74.28-2.15.58-4.58-.34-5.6-2.33-2.59-3.82.43-4.5 2.53q-.15.43-.25.85c-.45 1.56-.83 2.93-2.98 3.15.08-1.09-.28-2.69-.65-4.37-.54-2.43-1.12-5-.39-6.35.27-.5.67-.59 1.07-.68.42-.1.85-.2 1.1-.8.83-1.9-.5-2.7-1.98-2.77-4.18-.18-3.8 3.31-3.47 6.58.22 2.04.42 4-.5 4.9-.55-.5-.54-1.03-.52-1.6.01-.6.03-1.24-.55-1.99-1.2-1.6-3.16-1.46-4.9-.73 0-.3.05-.93.15-1.72.41-3.49 1.2-10.26-3.24-6.09-.8.8-.99 1.88-1.17 2.95-.12.7-.23 1.37-.5 1.95-.7 1.45-2.4 3.6-3.35 4.78-.47-1.92.16-4.26.7-6.22l.12-.45c.12-.45.46-1.2.85-2.07.84-1.84 1.9-4.2 1.53-5.17-1.27-3.38-4.63.5-6.52 2.68-.45.51-.8.94-1.05 1.15-1.58 1.4-7.88 6.04-9.9 4.64-.32-.23-.36-.74-.4-1.3-.05-.65-.1-1.38-.62-1.83-.48-.37-2.48-.57-3.06-.5.36-1.5-.34-3.44-2.05-2.9-1.23.34-1.45 1.54-1.67 2.72-.16.88-.33 1.75-.9 2.25-1.5 1.3-3.18.3-4.85-.68-1.15-.68-2.3-1.36-3.4-1.3q.13-.5.4-1.28c.85-2.44 2.23-6.45-1.8-4.87-1.24.5-2.12 3.35-2.44 4.54q-.2.82-.32 1.42c-.4 1.82-.5 2.32-3.18 3.03.1-.63.1-1.3.1-1.98 0-1.25 0-2.53.55-3.54q.23-.44.7-1.04c1.15-1.53 2.8-3.7-.25-4.05-3.78-.39-4.26 4.7-4.6 8.2-.08.9-.16 1.7-.28 2.25-4.12-2.5-6.86.96-9.33 4.07l-.15.2c.45-1.43 1.56-15.57-2.96-11.25-.84.8-.53 1.84-.24 2.87.14.55.3 1.1.27 1.6-.08 1.3-.5 2.43-1 3.62A25 25 0 0 1 95 17.1q-.45.6-.7 1c-.33.45-.49.7-.7.73s-.48-.17-1.04-.6l-.38-.3c-2.43-1.88-3.58-6.63-3.46-9.53q0-.55.1-1.2c.22-2.24.5-5.2-2.5-4.35s-2.05 6.15-1.5 9.2l.2 1.26c.4 2.7.65 5.43.2 8.17-2.3-2.36-3.1.87-3.6 2.97-.16.63-.28 1.16-.42 1.4-.7 1.26-1.84 2.07-2.98 2.86q-.7.48-1.36 1c-.42-1.47.28-2.83.93-4.1.6-1.15 1.14-2.23.84-3.27-1.1-3.87-4.1.93-5.1 2.55l-.2.32c-.25.37-.7 1.42-1.2 2.6-.8 1.85-1.73 4.03-2.17 4.33-1.03.7-7.6-2.53-8.28-3.14-.55-.5-.76-1.45-.97-2.38-.25-1.1-.5-2.22-1.34-2.6-4.72-2.2-1.93 5.72-1 7.36a24.3 24.3 0 0 1 2.94 14.5 6.4 6.4 0 0 1-2.4-2.07 6 6 0 0 1-.88-2.53c-.2-.96-.36-1.88-.94-2.46-3.3-3.28-3.68 2.88-3.4 4.8.32 2.35 1.2 3.66 2.2 5.13.51.76 1.06 1.57 1.57 2.6.94 1.9.37 4.07-.2 6.23a26 26 0 0 0-.62 2.9c-3.43-3.3-18.2-.55-14.4 4.5 1.17 1.55 2.47.44 3.8-.7.93-.8 1.87-1.6 2.8-1.55 4.11.22 6.25 5.3 5.98 8.84-.5-1.9-2.42-3.76-3.75-1.44-.8 1.4.32 3.67 1.1 5.25l.28.57c-.9-.44-5.37-2.52-6.25-2.16-3.44 1.4 1.3 4.15 2.54 4.7 4.22 1.79 6.9 3.85 8.2 8.92a3.7 3.7 0 0 1-2.3-1.7c-.3-.43-.62-.88-1.25-1.34-.95-.7-1.4-.7-1.96-.73a4 4 0 0 1-1.13-.14l-.07-.02c-2.36-.61-5.4-1.41-8.04-.31-1.97.82-5.3 3.3-5.9 5.65-.77 2.87.84 3.6 2.9 2.14a10 10 0 0 0 2.08-2.23c1.1-1.45 2.12-2.82 4.5-2.73a6.6 6.6 0 0 1 4.64 2.33c.44.53.8 1.2 1.14 1.85.3.57.6 1.15.98 1.64.28.38.75.82 1.23 1.27.74.68 1.5 1.4 1.74 2 1.3 3.3-.87 6.26-2.63 8.67l-.45.63c-.42-.55-3.47-1.76-4.1-1.88-2.94-.56-4.04.8-2.2 3.52.3.45.8.77 1.29 1.08.43.28.85.55 1.15.9.37.46.66 1.04.94 1.62.27.54.54 1.08.88 1.53.92 1.24 2 2.08 3.1 2.94q.83.64 1.68 1.4c-.33.2-.46 0-.6-.18-.12-.17-.25-.34-.5-.24-.2.07-.47.04-.75 0-.3-.04-.6-.08-.87 0-.47.16-.64.68-.8 1.15-.1.36-.22.7-.45.8-1.9.75-3.84-.6-5.7-1.87-1.34-.94-2.64-1.85-3.9-1.92-1.6-.08-2.96 1-2.2 3.03.46 1.13 2.06 1.85 3.27 2.4l.8.35c3.23 1.65 6.47 2.87 9.94 1.6a14.7 14.7 0 0 0 9.68 3.7c-2 1-4 2.22-4.7 4.7a12 12 0 0 1-.9-1.16c-1.4-1.96-3.52-4.9-4.74-1.31-1.04 3.1 3.73 6.87 5.93 8.27a17 17 0 0 1-7.28.59q-.46-.06-1.04-.25c-1.4-.43-3.06-.92-2.2 2 1.13 3.83 7.6 2.37 10.13 1.62-1.78 1.5-9.56 11.7-2.8 9.38.95-.33 1.53-1.34 2.13-2.4.77-1.35 1.58-2.77 3.28-2.98 2.48-.3 3.38 1.37 4.4 3.28.44.8.9 1.62 1.48 2.37.4.5 1.3 1.2 2.28 1.98 1.58 1.24 3.3 2.6 3.17 3.28-.1.46-.72.82-1.4 1.2-.77.45-1.6.93-1.9 1.63-.62 1.56-.34 2.76.54 4.09 1.17 1.78 3.1 2.4 4.92 3q.87.3 1.67.62c3.17 1.3 4.3 2.86 5.73 6.2-2.5.13-9.62 7.37-5.26 8.66 1.12.33 1.35-.25 1.6-.9.12-.3.24-.6.45-.87l.55-1.02.27-.52q.7-1.8 1.52-.22c.07-.02.47.08.9.18.4.09.87.2 1.04.22 1.2.07 2.1-.53 3.03-1.15q.6-.4 1.24-.75.48-.2.94-.35c.69-.22 1.34-.42 1.87-1.23-.1.13.56-2.5.57-2.54.13-.3.38-.45.63-.6.25-.13.5-.28.68-.63a55.8 55.8 0 0 1-15.5-34.47 12 12 0 0 1-8.3-11.28v-13a12 12 0 0 1 7.5-11.13c.53.38 1.27 0 1.5-.84-.46-1.5 3.3-27.85 13-34.87 3.62-2.44 23-2.62 42.31-2.6 19.1 0 38.11.18 41.69 2.6 9.7 7.02 13.46 33.37 13 34.87.23.84.97 1.22 1.5.84A12 12 0 0 1 196 110v13a12 12 0 0 1-8.17 11.38 55.7 55.7 0 0 1-11.07 29.28q.31 1.2.55 2.5c.18 1.1.23 2.14.28 3.15.1 2.04.2 3.94 1.37 5.95q.3.48.66.86c.33.38.66.76.86 1.28.16.44.2 1.05.25 1.68.1 1.4.2 2.92 1.7 2.92 3.1 0 1.37-5.97.6-7.38q-.45-.8-.82-1.41c-1.03-1.74-1.63-2.74-1.57-5.64 1.75 1.16 7.53 3.38 9.45 2.32 3.5-1.94-2.69-3.9-5.83-4.89a12 12 0 0 1-1.6-.56c.63-.63 1.3-1.14 1.97-1.66a14 14 0 0 0 3.22-3.1q.37-.52.73-1.1c1.01-1.6 2.1-3.3 3.82-3.39.4-.09 1.04.3 1.77.6 1.46.7 3.24 1.54 3.94.2.82-1.4-.18-1.9-1.07-2.34q-.46-.19-.78-.43c-.54-.45-.94-.57-1.19-.65-.45-.12-.5-.13-.27-1.48 1.1 1.17 2.8.43 3.25-1 .3-.93-.16-1.47-.56-1.96-.28-.34-.55-.66-.54-1.07 0 .4.83-5.1.7-4.93.85-1.12 3.8-.8 5.34-.63h.07c2.13.24 2.17.31 3.03 2.02l.22.42c.88 1.72 3.2 5.18 3.7.64.13-1.06-.86-3.38-1.44-4.32a5 5 0 0 0-1.6-1.33c-.6-.37-1.13-.7-1.32-1.1-.48-.94.08-2.47.68-4.12.6-1.6 1.22-3.33.96-4.73.3.12.73.7 1.23 1.38 1.3 1.75 3 4.07 3.96.22.33-1.26-1-3.24-2.27-5.1-1.48-2.2-2.86-4.28-1.24-4.79 2.29-.73 4.6 2.22 5.25 4.04.2.56.27 1.37.35 2.22.12 1.2.24 2.48.72 3.14 3.03 4.21 3.4-2.74 3.16-4.57-.56-4.02-2-6.98-5.63-8.5 1.14-1.42 0-2.58-.91-3.53l-.37-.37c.55-.6 2.22-.75 4-.9 3.13-.29 6.62-.6 5.2-3.43-.4-.76-1.53-1.08-2.5-1.34q-.55-.14-.96-.3M58.5 138.8q0-.2-.36.1z", fill: { type: "color", name: "hair" } } }] }, frida: { elements: [{ name: "path", type: "element", attributes: { d: "M76 98.17v-.23l.08.06c1.7-27.45 17.84-33.2 32.51-38.41 10.53-3.75 20.3-7.22 23.4-18.25 3.12 11.03 12.89 14.5 23.42 18.25 14.67 5.22 30.82 10.96 32.5 38.41l.1-.06v.23a12 12 0 0 1 9.88 10.22 16.4 16.4 0 0 0 2.97-16.92 16.5 16.5 0 0 0-2.46-25.86 16.5 16.5 0 0 0-10.62-23.04q.22-1.5.22-3.07a20.5 20.5 0 0 0-27.95-19.1A20.47 20.47 0 0 0 132 15.53a20.47 20.47 0 0 0-28.05 4.87 20.5 20.5 0 0 0-27.73 22.16A16.5 16.5 0 0 0 65.2 64.7a16.5 16.5 0 0 0-2.51 28.07 16.5 16.5 0 0 0 3.4 15.62A12 12 0 0 1 76 98.17m.2 36.7c-3.85-.58-7.11-3-8.85-6.34a16.5 16.5 0 0 0 8.2 25.71 16.52 16.52 0 0 0 14.76 20.72A16.5 16.5 0 0 0 108 184.8v-4.2a56 56 0 0 1-31.8-45.74m79.8 45.75v4.2q1.22.2 2.5.19a16.5 16.5 0 0 0 15.19-10.04 16.5 16.5 0 0 0 14.76-20.71 16.5 16.5 0 0 0 8.2-25.72c-1.74 3.34-5 5.76-8.86 6.34a56 56 0 0 1-31.81 45.73", fill: { type: "color", name: "hair" } } }, { name: "path", type: "element", attributes: { "fill-rule": "evenodd", "clip-rule": "evenodd", d: "M169.13 28.36q-.6.18-1.14.45-.25-.75-.62-1.48c3.72-3.63 5.25-9.54 5.25-9.54s-1.16.2-3.1.64c-.27.04-3.78.6-8.24 2.31-.8-.58-1.54-1.04-2.1-1.38.52-2.93 1.68-12.56-4.46-16.11-6.1-3.54-13.8 2.2-16.12 4.14l-.7-.42c-3.07-1.77-10.77-5.35-16.05-.23-5.64 5.46-2.3 14-1.04 16.7l-.53.53-.1-.11a7.1 7.1 0 0 0-8.07-1.52l-2.13.93-1.38-1.88a7.24 7.24 0 0 0-8.29-2.54 7.1 7.1 0 0 0-4.8 6.05l-.27 2.32-2.32.25a7.1 7.1 0 0 0-6.05 4.81 7.2 7.2 0 0 0 .83 6.53q-.7-.2-1.5-.2-.56.02-1.24.26.42-.6.6-1.13a5.2 5.2 0 0 0-9.96-3.04q-.15.55-.14 1.27-.44-.58-.9-.91a5.2 5.2 0 0 0-5.96 8.52q.46.31 1.16.53-.68.23-1.14.56a5.17 5.17 0 0 0-1.02 7.29 5.16 5.16 0 0 0 7.28 1.02q.44-.34.86-.93 0 .71.2 1.25a5.2 5.2 0 0 0 9.82-3.39 4 4 0 0 0-.62-1.1q.7.24 1.25.24a5.2 5.2 0 0 0 3.36-1.32 7.2 7.2 0 0 0 2.13 4.44 7.15 7.15 0 0 0 8.06 1.52l2.13-.93 1.38 1.88q.43.58.94 1.05-.78.77-1.64 1.44c-.47-.3-1.12-.7-1.92-1.06a12 12 0 0 0-13.25 1.82C83.62 61.47 82 67.7 82 67.7s7.37 4.17 15.26.42c5.9-2.8 6.53-7.22 6.48-9.26q1.18-.96 2.26-2.07a7.3 7.3 0 0 0 5.72.36 7.1 7.1 0 0 0 4.8-6.05l.26-2.32 2.32-.26a7.1 7.1 0 0 0 5.3-3.24c2.57.32 4.97.13 6.2 0 .99 1.87 3.82 6.7 7.88 9.05a9 9 0 0 0 5.07 1.33c6.9-.36 9.92-10 10.67-12.92.64-.09 1.6-.24 2.7-.5a7.4 7.4 0 0 0 .16 8.24 7.4 7.4 0 0 0 5.93 3.16q.8 0 1.78-.3-.6.82-.88 1.58a7.4 7.4 0 0 0 13.65 5.65l.34.62c-.71 1.48-3.8 8.96 5.53 12.36 6.77 2.46 13.45-1.15 13.5-1.17 0 0-2.07-9.48-9.46-12.55a7.4 7.4 0 0 0 3.7-7.5 7.4 7.4 0 0 0-2.87-4.87 6 6 0 0 0-1.62-.8q.97-.3 1.65-.76a7.4 7.4 0 0 0-8.5-12.12q-.65.47-1.26 1.3 0-1.03-.2-1.8a7.4 7.4 0 0 0-3.6-4.38 7.4 7.4 0 0 0-5.65-.54m-4.1 10.84-.72-.22.4-.3q.14.25.33.52m14.36 20.08.48.33q-.54.26-.93.52-.5-.9-.8-1.65.03-.26.03-.53a6 6 0 0 0 1.22 1.33M91.2 42.12l-.12-.32.2.15z", fill: "black", "fill-opacity": ".2" } }, { name: "path", type: "element", attributes: { d: "M178.03 58.94s-4.98 8.83 5.4 12.6c6.8 2.48 13.5-1.16 13.5-1.16s-2.16-9.9-9.97-12.75c-6.1-2.22-8.93 1.3-8.93 1.3", fill: "#5DD362" } }, { name: "path", type: "element", attributes: { d: "M196.93 70.38s-2.16-9.9-9.97-12.75c-4.07-1.48-6.7-.4-8.02.5-1.36-2.4-1.47-4.18-1.45-4.25.03-.3-.2-.53-.46-.63-.07-.02-.2-.07-.3-.03-.39 0-.67.37-.66.75 0 .23.35 4.54 4.63 8.83 6.05 6.6 16.23 7.58 16.23 7.58", fill: "#42BC53" } }, { name: "path", type: "element", attributes: { "fill-rule": "evenodd", "clip-rule": "evenodd", d: "M165.22 27c5.28-3.06 7.4-11.2 7.4-11.2s-7.38-4.18-15.26-.43-6.37 10.37-6.37 10.37 6.61 5.65 14.23 1.25", fill: "#5DD362" } }, { name: "path", type: "element", attributes: { "fill-rule": "evenodd", "clip-rule": "evenodd", d: "M147 29.43c.05.08.1.17.24.2.42.34 1.09.3 1.42-.12a24 24 0 0 1 3.26-3.13c1.97 1.4 7.33 4.1 13.3.64 5.28-3.06 7.4-11.2 7.4-11.2s-1.16.2-3.1.63c-.54.07-14.38 2.3-22.36 11.87a1 1 0 0 0-.16 1.13", fill: "#42BC53" } }, { name: "path", type: "element", attributes: { "fill-rule": "evenodd", "clip-rule": "evenodd", d: "M89.4 54.5C84.1 57.55 82 65.7 82 65.7s7.37 4.17 15.26.42 6.36-10.37 6.36-10.37-6.6-5.65-14.23-1.25", fill: "#5DD362" } }, { name: "path", type: "element", attributes: { "fill-rule": "evenodd", "clip-rule": "evenodd", d: "M107.61 52.06c-.05-.08-.1-.17-.23-.2-.42-.34-1.1-.3-1.43.12a24 24 0 0 1-3.26 3.16c-1.97-1.41-7.32-4.1-13.3-.64-5.28 3.05-7.4 11.2-7.4 11.2s1.16-.2 3.1-.64c.54-.07 14.39-2.3 22.37-11.87.3-.3.35-.8.15-1.16", fill: "#42BC53" } }, { name: "path", type: "element", attributes: { d: "M67.58 49.96a5.17 5.17 0 0 1 1.02-7.29q.47-.33 1.14-.56a4 4 0 0 1-1.16-.53 5.2 5.2 0 0 1 5.96-8.52q.46.33.9.91-.01-.71.14-1.27a5.16 5.16 0 0 1 6.5-3.45 5.2 5.2 0 0 1 3.45 6.5q-.17.53-.59 1.12.68-.23 1.25-.25a5.2 5.2 0 0 1 .18 10.4q-.57 0-1.25-.2.43.56.62 1.1a5.2 5.2 0 1 1-9.83 3.38 4 4 0 0 1-.2-1.25q-.4.58-.85.93a5.17 5.17 0 0 1-7.28-1.02", fill: "#4ACAD3" } }, { name: "path", type: "element", attributes: { "fill-rule": "evenodd", "clip-rule": "evenodd", d: "M80.82 37.64a1.44 1.44 0 1 0-2.76-.84c-.23.76.23 4.18.23 4.18s2.3-2.58 2.53-3.34m2.24 5.8a1.44 1.44 0 1 0-.05-2.9c-.8.02-3.9 1.52-3.9 1.52s3.16 1.4 3.95 1.38M77 41.42s-1.74-2.98-2.4-3.44a1.44 1.44 0 1 0-1.65 2.37c.65.45 4.05 1.07 4.05 1.07m3.08 6.84a1.44 1.44 0 0 0 .9-1.84c-.26-.75-2.65-3.25-2.65-3.25s-.35 3.44-.1 4.2a1.44 1.44 0 0 0 1.85.9m-5.32-1.97c.64-.48 2.27-3.52 2.27-3.52s-3.37.73-4 1.2a1.44 1.44 0 1 0 1.73 2.32", fill: "white" } }, { name: "path", type: "element", attributes: { d: "m116.53 49.1.25-2.32 2.32-.26a7.1 7.1 0 0 0 6.05-4.8 7.2 7.2 0 0 0-2.55-8.29l-1.87-1.38.93-2.13c1.23-2.8.65-5.9-1.52-8.06a7.1 7.1 0 0 0-8.06-1.52l-2.13.93-1.38-1.88a7.24 7.24 0 0 0-8.29-2.54 7.1 7.1 0 0 0-4.8 6.05l-.26 2.32-2.32.25a7.1 7.1 0 0 0-6.05 4.81 7.2 7.2 0 0 0 1.67 7.53q.4.4.87.76l1.88 1.38-.93 2.13a7.15 7.15 0 0 0 1.52 8.06 7.15 7.15 0 0 0 8.06 1.52l2.13-.93 1.38 1.88a7.2 7.2 0 0 0 8.29 2.54 7.1 7.1 0 0 0 4.8-6.05", fill: "#FDB599" } }, { name: "path", type: "element", attributes: { "fill-rule": "evenodd", "clip-rule": "evenodd", d: "M108.88 41.2a1.44 1.44 0 1 1-2.78.74c-.2-.77-.1-5.94-.1-5.94s-2.5 4.53-3.06 5.1a1.44 1.44 0 0 1-2.03-2.05c.56-.56 5.1-3.05 5.1-3.05s-5.15.1-5.92-.1a1.44 1.44 0 0 1 .75-2.78c.77.2 5.19 2.88 5.19 2.88s-2.67-4.42-2.87-5.2a1.44 1.44 0 1 1 2.78-.74c.2.77.1 5.94.1 5.94s2.5-4.53 3.06-5.1a1.44 1.44 0 0 1 2.04 2.05c-.56.56-5.1 3.05-5.1 3.05s5.17-.1 5.94.1a1.44 1.44 0 1 1-.75 2.78c-.8-.2-5.22-2.88-5.22-2.88s2.67 4.42 2.88 5.2", fill: "white" } }, { name: "path", type: "element", attributes: { d: "M189.76 55.82a7.36 7.36 0 0 0-1.46-10.36 6 6 0 0 0-1.62-.8q.97-.3 1.65-.76a7.4 7.4 0 0 0-8.5-12.12q-.65.46-1.26 1.3.01-1.03-.2-1.8a7.4 7.4 0 0 0-3.6-4.38 7.4 7.4 0 0 0-10.55 8.7q.24.76.82 1.6a6 6 0 0 0-1.77-.36 7.4 7.4 0 0 0-.26 14.8q.8 0 1.78-.3-.6.82-.88 1.58a7.4 7.4 0 0 0 14 4.81 6 6 0 0 0 .26-1.78q.6.83 1.22 1.33a7.4 7.4 0 0 0 5.49 1.42 7.4 7.4 0 0 0 4.88-2.88", fill: "#F7D30C" } }, { name: "path", type: "element", attributes: { "fill-rule": "evenodd", "clip-rule": "evenodd", d: "M170.9 38.3a2.05 2.05 0 1 1 3.94-1.2c.33 1.08-.33 5.94-.33 5.94s-3.27-3.66-3.6-4.74m-3.18 8.25a2.06 2.06 0 1 1 .07-4.11c1.13.02 5.56 2.15 5.56 2.15s-4.5 1.97-5.63 1.96m8.62-2.88s2.47-4.24 3.4-4.9a2.06 2.06 0 1 1 2.36 3.38c-.93.65-5.76 1.52-5.76 1.52m-4.38 9.73a2.06 2.06 0 0 1-1.27-2.6c.37-1.08 3.76-4.63 3.76-4.63s.5 4.89.13 5.96a2.06 2.06 0 0 1-2.62 1.27m7.57-2.8c-.9-.67-3.23-5-3.23-5s4.8 1.05 5.7 1.73a2.06 2.06 0 1 1-2.47 3.28", fill: "white" } }, { name: "path", type: "element", attributes: { d: "M168.14 31.55c1.82-6.99-6-12.42-8.95-14.19.5-2.93 1.67-12.56-4.47-16.11-6.1-3.54-13.8 2.2-16.12 4.14l-.7-.42c-3.07-1.77-10.77-5.35-16.05-.23-5.64 5.46-2.3 14-1.04 16.7-2.13 2-8.36 8.59-5.79 15.58a8.6 8.6 0 0 0 3.9 4.54c4.02 2.34 9.59 1.96 11.7 1.7 1.01 1.89 3.84 6.72 7.9 9.07a9 9 0 0 0 5.07 1.33c6.9-.36 9.92-10 10.67-12.92 2.86-.4 12.09-2.2 13.92-9.2", fill: "#FF7398" } }, { name: "path", type: "element", attributes: { "fill-rule": "evenodd", "clip-rule": "evenodd", d: "M141.76 25.6s3.69 8.2.36 8.71-1.46-8.59-1.46-8.59-7.11 6-8.15 3.03 7.7-4.05 7.7-4.05-7.96-4.7-5.36-6.83c2.59-2.15 6.2 6.1 6.2 6.1s1.95-8.93 4.83-7.27-3.86 7.82-3.86 7.82 8.88-1 8.37 2.35c-.5 3.34-8.6-1.27-8.6-1.27", fill: "white" } }, { name: "rect", type: "element", attributes: { x: "190", y: "129", width: "2", height: "39", rx: "1", fill: "#E6E6E6" } }, { name: "path", type: "element", attributes: { d: "M201 166h-9.43l6.43-17h-11l-6 21h8.64L185 189z", fill: "#9177FF" } }] }, frizzle: { elements: [{ name: "path", type: "element", attributes: { "fill-rule": "evenodd", "clip-rule": "evenodd", d: "M89.91 55.36h84.18c18.24-10.53 21.67-29.2 8.76-45.43-3.21-4.04-8.76 11.75-25.82 12.72s-15.42-6.3-33.57-3.58c-18.15 2.73-16.15 17.3-28 20.8-11.84 3.5-5.55 15.5-5.55 15.5", fill: { type: "color", name: "hair" } } }] }, fro: { elements: [{ name: "path", type: "element", attributes: { d: "M93.7 69.39c-4.62 24.47-16 42.72-25.74 41a8 8 0 0 1-1.96-.63V89a66 66 0 0 1 28.4-54.24q.72 3.6 1.05 7.77a263 263 0 0 1 36.9-2.44c13.27 0 25.67.85 36.22 2.34q.33-4.1 1.05-7.67A65.9 65.9 0 0 1 198 89v20.76q-.94.46-1.95.63c-9.72 1.72-21.09-16.48-25.73-40.9a261 261 0 0 1-37.97 2.57c-14.3 0-27.6-1-38.65-2.7", fill: "black", "fill-opacity": ".16" } }, { name: "path", type: "element", attributes: { d: "M132 0c-11.21 0-21.9 2.2-31.69 6.18Q98.93 6 97.5 6c-6.7 0-12.77 3.07-17.2 8.06-18.04.93-33.46 13.3-40.77 30.9C31.5 49.56 26 59.04 26 70q0 .87.05 1.73A62 62 0 0 0 16 106c0 7.33 1.21 14.34 3.43 20.78Q19 129.32 19 132c0 9.45 4.1 17.81 10.38 22.88C36.74 172.68 52.6 185 71 185q2.25 0 4.44-.24C80.9 189.9 87.88 193 95.5 193c4.44 0 8.67-1.05 12.5-2.95v-9.44a56 56 0 0 1-31.8-45.74A12 12 0 0 1 66 123v-13c0-1.72.36-3.36 1.02-4.84q.46.15.94.23c9.73 1.72 21.12-16.53 25.74-41a260 260 0 0 0 38.65 2.7c14.02 0 27.06-.96 37.97-2.6 4.64 24.4 16.01 42.6 25.73 40.9q.48-.1.94-.25a12 12 0 0 1 1 4.83v13a12 12 0 0 1-10.2 11.87 56 56 0 0 1-31.81 45.74v9.44a28 28 0 0 0 12.5 2.95c7.62 0 14.6-3.1 20.06-8.24q2.19.24 4.44.24c18.39 0 34.26-12.32 41.62-30.12 6.3-5.05 10.4-13.4 10.4-22.85q0-2.68-.43-5.22A64 64 0 0 0 248 106a62 62 0 0 0-10.05-34.27q.06-.87.05-1.73c0-10.96-5.5-20.44-13.53-25.04-7.31-17.6-22.73-29.97-40.77-30.9C179.27 9.07 173.2 6 166.5 6q-1.43 0-2.81.18A84 84 0 0 0 132 0", fill: { type: "color", name: "hair" } } }] }, froBand: { elements: [{ name: "path", type: "element", attributes: { d: "M249 70.5q0 1.2-.1 2.37A57.7 57.7 0 0 1 260 107c0 7.16-1.3 14.01-3.67 20.34q.67 2.98.67 6.16c0 9.79-4.93 18.42-12.45 23.56a53.5 53.5 0 0 1-53.86 29.63A36.4 36.4 0 0 1 167.5 195c-4.02 0-7.88-.65-11.5-1.85v-12.54a56 56 0 0 0 31.8-45.74A12 12 0 0 0 198 123v-13a12 12 0 0 0-10-11.83V92a56 56 0 0 0-2.22-15.68l1.37 12.87-11.34-24-45.13-19.52-30.12 10.56-21.5 20.2-.04-2.61A56 56 0 0 0 76 92v6.17A12 12 0 0 0 66 110v13a12 12 0 0 0 10.2 11.87A56 56 0 0 0 108 180.6v10.94A36 36 0 0 1 92.5 195a36.4 36.4 0 0 1-23.19-8.31q-2.86.3-5.81.31a53.5 53.5 0 0 1-48.05-29.94 28.5 28.5 0 0 1-11.78-29.72A58 58 0 0 1 0 107a57.7 57.7 0 0 1 11.1-34.13 28.5 28.5 0 0 1 16-28.04 55 55 0 0 1 47.55-31.78 28.4 28.4 0 0 1 26.6-7.24A84 84 0 0 1 132 0a84 84 0 0 1 29.4 5.3q2.01-.3 4.1-.3a28.4 28.4 0 0 1 19.85 8.05 55 55 0 0 1 47.55 31.78A28.5 28.5 0 0 1 249 70.5", fill: { type: "color", name: "hair" } } }, { name: "path", type: "element", attributes: { d: "M187.37 98.98q.62-3.84.63-7.83C188 62.35 162.7 39 131.5 39S75 62.35 75 91.15q0 4 .63 7.82c4.1-25.09 27.55-44.32 55.87-44.32s51.78 19.23 55.87 44.33", fill: "#92D9FF" } }] }, hat: { elements: [{ name: "path", type: "element", attributes: { d: "M187.32 138.76C226.9 129.26 254 109.87 254 87.5c0-23.5-29.92-43.72-72.8-52.63l-.31-1.43A40 40 0 0 0 141.82 2h-18.64A40 40 0 0 0 84.1 33.44l-.27 1.21C40.4 43.45 10 63.8 10 87.5c0 22.37 27.1 41.76 66.68 51.26q-.3-1.92-.47-3.9A12 12 0 0 1 66.01 123v-13a12 12 0 0 1 10.01-11.83V92c0-8 1.68-15.62 4.7-22.51 8.61-15.69 92.74-16.49 102.66.16A56 56 0 0 1 188 92v6.17A12 12 0 0 1 198 110v13a12 12 0 0 1-10.2 11.87 56 56 0 0 1-.48 3.9", fill: { type: "color", name: "hat" } } }, { name: "path", type: "element", attributes: { d: "M188 92.74c3.85-3.25 6-6.9 6-10.74 0-6.08-5.38-11.65-14.32-15.98a12 12 0 0 1 3.68 3.63A56 56 0 0 1 188 92zm-31.74-33.75a144 144 0 0 0-24.26-2c-8.98 0-17.52.78-25.22 2.17 15.16-2.2 34.11-2.3 49.48-.17m-72.57 7.34C75.12 70.63 70 76.07 70 82c0 3.85 2.15 7.49 6 10.74V92c0-8 1.68-15.62 4.7-22.51a10 10 0 0 1 2.99-3.16", fill: "black", "fill-opacity": ".5" } }] }, hijab: { elements: [{ name: "path", type: "element", attributes: { "fill-rule": "evenodd", "clip-rule": "evenodd", d: "M65 77.34Q64 83.03 64 89v48q0 1.46.06 2.9L64 142c.14 3.68-1.86 11.8-4.34 21.9-3.88 15.77-8.94 36.4-8.94 52.55 0 13.01 1.98 22.84 3.89 32.3 1.97 9.78 3.86 19.16 3.39 31.25h47s-.95-13.2-2.47-26.36c10.05 10.2 22.82 16.84 39.05 16.84 70.55 0 77.62-53.83 77.62-65.24 0-6.04-4.32-10.88-8.39-15.44-3.6-4.05-7.02-7.87-7-12.1 0-4.35 1.02-7.4 2.07-10.52 1.12-3.33 2.27-6.75 2.27-11.96 0-5.82-1.43-7.5-2.9-9.25a10.7 10.7 0 0 1-2.8-5.62c-.87-4.54-1.86-14.32-2.45-20.77V89A68 68 0 0 0 65.04 77.08L65 77zM132 53c-30.1 0-55 24.4-55 54.5v23c0 30.1 24.9 54.5 55 54.5s55-24.4 55-54.5v-23c0-30.1-24.9-54.5-55-54.5", fill: { type: "color", name: "hat" } } }, { name: "path", type: "element", attributes: { d: "M192.93 104.96A61 61 0 0 0 194 93.5c0-33.97-27.76-61.5-62-61.5S70 59.53 70 93.5q.01 5.89 1.07 11.46a61 61 0 0 1 121.86 0", fill: "white", "fill-opacity": ".5" } }, { name: "path", type: "element", attributes: { d: "M77.07 104.69q-.07 1.4-.07 2.81v23c0 30.1 24.9 54.5 55 54.5s55-24.4 55-54.5v-23q0-1.41-.07-2.81 1.06 5.25 1.07 10.81v23a54.5 54.5 0 0 1-54.5 54.5h-3A54.5 54.5 0 0 1 76 138.5v-23q.01-5.56 1.07-10.81m108.98 89.45c-4.39 6.9-17.9 13.66-34.65 16.62-16.74 2.95-31.75 1.22-38.23-3.76q.03.4.1.78c1.7 9.69 19.42 14.67 39.57 11.12s35.1-14.3 33.38-23.99q-.06-.38-.17-.77m11.6 15.35c-2.63 9.6-14.86 20.2-31.55 26.28-16.68 6.07-32.87 5.8-41.06.15q.14.5.32 1c4.53 12.44 24.47 16.6 44.55 9.3s32.67-23.32 28.15-35.75z", fill: "black", "fill-opacity": ".16", opacity: ".9" } }] }, longButNotTooLong: { elements: [{ name: "path", type: "element", attributes: { d: "M49 90.5c0 4.55 1.7 8.64 4.85 10.77.9.61 2.47.93 4.15 1.07V182a8 8 0 0 0 8 8h42v-9.39a56 56 0 0 1-31.8-45.74A12 12 0 0 1 66 123v-13a12 12 0 0 1 3.87-8.83c11.54-2.61 24.1-7.53 36.47-14.67 12.13-7 22.5-15.24 30.48-23.75a87 87 0 0 1-12.45 20.78q19-8.28 25.9-26.63.56 1.38 1.17 2.76c10.26 23.03 27.88 39.36 45.77 44.74.5 2.11.79 4.08.79 5.6v13a12 12 0 0 1-10.2 11.87A56 56 0 0 1 156 180.6v9.4h18a32 32 0 0 0 32-32v-54.12q0-.1-.03-.28c-.07-5.64-.28-18.87-.6-21.37A74 74 0 0 0 131.99 18c-36.08 0-66.14 25.83-73 60-5.54 0-10 5.6-10 12.5", fill: { type: "color", name: "hair" } } }, { name: "path", type: "element", attributes: { d: "M151.44 59.66c11.94 26.81 33.86 44.53 54.56 46.5V92A74 74 0 0 0 59.32 78H59c-5.52 0-10 5.6-10 12.5 0 6.48 3.95 11.81 9 12.44v.15l.95-.1H59a8 8 0 0 0 1.9-.24c13.8-1.77 29.78-7.23 45.44-16.27 12.13-7 22.5-15.25 30.48-23.76a87 87 0 0 1-12.45 20.78q19-8.28 25.9-26.63.56 1.38 1.17 2.76", fill: "white", "fill-opacity": ".08" } }] }, miaWallace: { elements: [{ name: "path", type: "element", attributes: { "fill-rule": "evenodd", "clip-rule": "evenodd", d: "M68.03 76.21q19.4-49.6 41.03-49.6c.54 0 29.25-.23 48.05-.35C177.77 35.59 192 55.3 192 78.1V93h-82.94l-2.8-23.18-3.9 23.18H68V78.11q0-.95.03-1.9", fill: "black", "fill-opacity": ".16" } }, { name: "path", type: "element", attributes: { d: "M39 145c-.09-18.98 30.32-97.2 41-110 7.92-9.5 27.7-15.45 52-15s44.86 3.81 53 14c12.32 15.43 40.09 92.02 40 111-.1 21.27-9.62 33.59-18.6 45.22A293 293 0 0 0 202 196c-10.28-2.66-27.85-5.18-46-6.68v-8.7A56 56 0 0 0 188 130V92q0-2.02-.14-4h-76.8l-2.8-21.44-3.9 21.44H76.14Q76 89.98 76 92v38a56 56 0 0 0 32 50.61v8.7c-18.15 1.5-35.72 4.03-46 6.69q-2.14-2.88-4.39-5.78c-9-11.62-18.5-23.95-18.61-45.22", fill: { type: "color", name: "hair" } } }] }, shaggy: { elements: [{ name: "path", type: "element", attributes: { "fill-rule": "evenodd", "clip-rule": "evenodd", d: "M87.18 37.86c5.14-3.84 11.22-7.12 17.56-8.38 6.45-1.28 10.36-1.6 16.7-.07 1.64.39 2.2.78 3.63-.15 1.2-.8 9.66-9.5 35.42-4.66 26.03 4.88 33.77 44.08 43.42 45.57 3.5.53 7.8-.39 7.92-2.53 3.96 6.03 5 14 3.33 21.07-1.45 6.1-4.5 11.8-10 15.14-4.72 2.87-11.25 4.12-16.7 3.6a22 22 0 0 1-7.04-1.78c-2.76-1.2-4.96-3.4-7.67-4.54a54 54 0 0 0 9.18 6.42c1.64.9 3.3 1.53 5.11 2.02 1.24.34 3.76 1.48 4.96 1.18-7.8 1.4-15.16.18-22.32-3.16a52 52 0 0 1-9.2-5.48c-2.83-2.13-6.09-4.3-8.3-7.1.93 1.2-.7-.6-.92-.8q-.9-.94-1.78-1.9-1.52-1.63-2.93-3.38-3.02-3.72-5.5-7.8c-1.69-2.76-8.37-13.87-10.39-16.5a195 195 0 0 0 6.41 16.93c-4.7-1.47-9.28-5.54-12.3-9.34a29.5 29.5 0 0 1-6.1-14.66c-3.83 10.41-12.79 18.63-22.03 24.3 2-3.74 5.05-6.9 7.05-10.69-9.2 9.33-24.57 13.9-28.6 27.58-1.03-4.76-4.35-8.58-5.34-13.43-1.1-5.4-1.9-11.1-1.73-16.62.4-12.24 8.64-23.72 18.16-30.82", fill: { type: "color", name: "hair" } } }] }, shaggyMullet: { elements: [{ name: "path", type: "element", attributes: { d: "M176.75 37.86c9.52 7.1 17.76 18.58 18.16 30.82.17 5.5-.62 11.23-1.73 16.62-.5 2.46-1.6 4.66-2.7 6.85-1.07 2.12-2.13 4.24-2.64 6.58-2.63-8.93-10.09-13.97-17.5-19-3.96-2.66-7.9-5.33-11.1-8.58 1.02 1.93 2.3 3.7 3.6 5.46 1.23 1.7 2.47 3.4 3.45 5.22-9.24-5.66-18.2-13.88-22.03-24.3a29.5 29.5 0 0 1-6.1 14.67c-3.02 3.8-7.59 7.87-12.3 9.34 2.43-5.5 4.5-11.21 6.4-16.92-1.78 2.31-7.2 11.29-9.6 15.23l-.77 1.26a74 74 0 0 1-10.47 13.35c-.5.53-1.42 1.52-.67.54-1.85 2.35-4.45 4.26-6.9 6.07l-1.4 1.04a52 52 0 0 1-9.2 5.48c-7.1 3.31-14.38 4.54-22.1 3.2.9.1 2.34-.4 3.52-.82a20 20 0 0 1 1.22-.4c1.8-.5 3.47-1.12 5.11-2.02a54 54 0 0 0 9.18-6.42c-1.37.58-2.6 1.42-3.84 2.27-1.23.83-2.46 1.67-3.83 2.27-2.28 1-4.54 1.53-7.03 1.77-5.46.53-12-.72-16.72-3.6-5.5-3.32-8.54-9.04-9.99-15.13-1.68-7.06-.63-15.04 3.33-21.07.13 2.14 4.43 3.06 7.92 2.53 3.77-.59 6.95-6.52 10.9-13.93C77.11 44.7 85.2 29.57 100.44 25.6c19.96-5.2 34.21 3.87 35.42 4.66 1.22.78 1.8.63 2.93.32l.64-.17c6.35-1.47 13.26-2.16 19.7-.87 6.35 1.26 12.43 4.54 17.57 8.38M70.92 110.78l.21.04zm7.1 45.42q1.2-2.3 2.32-4.6a56.2 56.2 0 0 0 27.68 29v9.01a54 54 0 0 1-7.73 2c-9 1.63-34.32-3.52-45.44-11.97-.85-.65-.42-1.92.67-2 11.66-.8 17.63-12.13 22.4-21.2zm78 26.85v-2.44c6.95-3.3 13.11-8 18.13-13.71.71 2.24 1.75 4.33 3.43 5.79 1.32 1.14 3.48 1.12 5.34 1.1h1.2q2.5.1 5.02-.01c.83-.03 1.2 1.02.53 1.5l-.4.26a39 39 0 0 1-3.24 1.82 29 29 0 0 1-7.98 2.73q-2.89.5-5.66.18a10 10 0 0 0 1.7 1.94c1.41 1.22 3.72 1.2 5.7 1.19h1.28q2.69.09 5.36-.02c.9-.04 1.3 1.09.57 1.6q-.2.16-.42.28-1.68 1.05-3.47 1.94a31 31 0 0 1-8.52 2.92c-5.5.97-10.86-.18-15.19-3.7a25 25 0 0 1-3.38-3.37", fill: { type: "color", name: "hair" } } }, { name: "path", type: "element", attributes: { d: "M80.32 151.6q-1.12 2.3-2.31 4.6l-.1.18c-4.73 9.08-10.7 20.42-22.4 21.22-1.05.07-1.5 1.34-.63 1.99 11.12 8.45 36.43 13.6 45.44 11.98a54 54 0 0 0 7.73-1.96v-8.95a56.2 56.2 0 0 1-27.68-29m75.67 29v2.43a25 25 0 0 0 3.38 3.36c4.33 3.53 9.7 4.68 15.2 3.71a31 31 0 0 0 8.51-2.92 42 42 0 0 0 3.9-2.23c.72-.5.32-1.64-.57-1.6q-2.67.1-5.35.01h-1.3c-1.97.01-4.28.03-5.7-1.2a10 10 0 0 1-1.7-1.93q2.78.33 5.67-.18a29 29 0 0 0 7.98-2.73 39 39 0 0 0 3.64-2.08c.68-.48.3-1.53-.53-1.5a70 70 0 0 1-5.02.02h-1.2c-1.85.01-4.01.03-5.33-1.1-1.7-1.47-2.72-3.56-3.43-5.8a56 56 0 0 1-18.14 13.7", fill: "black", "fill-opacity": ".16" } }] }, shavedSides: { elements: [{ name: "path", type: "element", attributes: { d: "m174.83 55.92-.03.02q1.14 1.32 2.19 2.7a55.7 55.7 0 0 1 11 33.36v5.5a54.3 54.3 0 0 0-17.4-39.93c-11.58 3.77-49.58 14.27-77.63.42A54.4 54.4 0 0 0 76 97.5V92c0-12.5 4.1-24.04 11.01-33.35q1.07-1.41 2.22-2.75l-.02-.02A55.9 55.9 0 0 1 132.01 36a55.9 55.9 0 0 1 42.81 19.92", fill: "black", "fill-opacity": ".16" } }, { name: "path", type: "element", attributes: { d: "M91.54 53.29A55.8 55.8 0 0 0 76 92v6.16a12 12 0 0 0-6.49 3.34l.7-17.37a46 46 0 0 1 17.37-34.17c-2.2-3.84-1.45-10.33 7.8-13.1 5.07-1.5 7.57-5.08 10.24-8.88 3.5-5 7.27-10.37 17.48-11.92 9.87-1.5 13.23-.88 17.05-.18 3.13.57 6.58 1.2 14.2.76 9.85-.57 16.86-4 21.43-6.22 3.26-1.6 5.27-2.58 6.17-1.47 15.42 18.9 6.97 33.8-6.2 41.96A45.9 45.9 0 0 1 192 86v13.6q-1.84-1.07-4-1.43V92a55.8 55.8 0 0 0-16-39.19c-7.76 2.75-50.39 16.55-80.46.48m131.07 172.76c3.06 5.6 4.05 11.12 3.5 16.38A72 72 0 0 0 160 199h-4v-18.39a56 56 0 0 0 31.8-45.74c1.5-.23 2.93-.74 4.2-1.47v20.7c0 20.77 11.47 39.79 22.15 57.47 2.97 4.93 5.88 9.75 8.46 14.48M67.7 146.5l.66-16.35a12 12 0 0 0 7.85 4.72A56 56 0 0 0 108 180.6V199h-4c-11.2 0-21.8 2.56-31.25 7.12-2.99-18.29-4.3-38.68-5.05-59.62", fill: { type: "color", name: "hair" } } }, { name: "path", type: "element", attributes: { "fill-rule": "evenodd", "clip-rule": "evenodd", d: "M89.88 52.36c33.22 19.3 83.37 0 83.37 0 14.53-7.77 25.08-23.32 8.7-43.4-2.17-2.66-10.7 6.72-27.6 7.7-16.9.97-13.27-3.31-31.25-.59-17.97 2.73-15.99 17.3-27.72 20.8s-9.8 13-5.5 15.5", fill: "white", "fill-opacity": ".2" } }] }, shortCurly: { elements: [{ name: "path", type: "element", attributes: { "fill-rule": "evenodd", "clip-rule": "evenodd", d: "M192.77 70.77a63 63 0 0 0-1.52-9.86 52 52 0 0 0-2.5-7.49c-.6-1.48-2.02-3.52-2.19-5.13-.16-1.57 1.07-3.32 1.33-5.16.21-1.8.2-3.66-.2-5.44-.83-4.06-3.6-7.81-7.85-8.85-.95-.23-2.97.06-3.64-.5-.77-.63-1.3-2.8-2-3.67-2-2.47-5.1-4.07-8.37-3.51-2.4.4-1.03.9-2.84-.51-1-.8-1.75-2-2.73-2.85a25 25 0 0 0-4.9-3.28 51 51 0 0 0-14.85-4.91c-9.28-1.52-19.2-.2-28.2 2.22a75 75 0 0 0-13.14 4.74c-1.78.87-2.8 1.58-4.67 1.8-2.93.37-5.4.35-8.18 1.59-8.54 3.82-12.39 12.69-9.06 21.17a15 15 0 0 0 2.82 4.59c1.52 1.68 2.07 1.35.76 3.28a53 53 0 0 0-4.96 9.17C72.36 66.58 71.77 76.04 72 85c.08 3.13.22 6.3.71 9.42.22 1.34.28 3.87 1.3 4.87.51.5 1.24.78 1.96.58 1.7-.47 1.12-1.73 1.16-2.9.2-5.88-.08-11.08 1.32-16.9a44 44 0 0 1 5-12.03 72 72 0 0 1 9.8-13.35c.92-1.01 1.12-1.41 2.35-1.5.93-.04 2.3.6 3.2.8 2 .5 4 .99 6.03 1.3 3.74.6 7.45.66 11.22.54 7.43-.23 14.88-.75 22.1-2.62 4.77-1.24 9.01-3.47 13.6-5.1.07-.04 1.22-.85 1.42-.82.28.04 1.97 1.82 2.26 2.05 2.23 1.74 4.67 2.48 7.07 3.83 2.97 1.66.1-.72 1.73 1.36.48.6.72 1.72 1.1 2.4 1.22 2.2 2.9 4.1 4.93 5.63 1.95 1.47 4.89 2.18 5.89 4.1.76 1.47 1.02 3.48 1.64 5.06 1.63 4.13 3.78 7.99 5.93 11.88 1.73 3.14 3.62 5.89 3.8 9.47.08 1.25-1.11 8.74 1.79 6.46.43-.34 1.35-4.15 1.54-4.8.77-2.63 1.05-5.38 1.4-8.1.69-5.37.92-10.5.46-15.9", fill: { type: "color", name: "hair" } } }] }, shortFlat: { elements: [{ name: "path", type: "element", attributes: { "fill-rule": "evenodd", "clip-rule": "evenodd", d: "M179.15 39.92c-2.76-2.82-5.96-5.21-9.08-7.61q-1.04-.79-2.06-1.6c-.15-.12-1.72-1.24-1.9-1.66-.4-.99-.1-.22-.1-1.4.1-1.5 3.2-5.73.9-6.7-1-.43-2.8.7-3.73 1.08a60 60 0 0 1-5.73 1.9c.92-1.85 2.7-5.57-.64-4.58-2.6.78-5.04 2.77-7.65 3.7.86-1.4 4.32-5.8 1.2-6.05-.98-.07-3.8 1.75-4.86 2.14a56 56 0 0 1-9.63 2.51c-11.2 2.02-24.3 1.45-34.65 6.54-8 3.93-15.88 10.03-20.5 17.8-4.44 7.48-6.1 15.67-7.03 24.25-.7 6.3-.74 12.8-.42 19.12.1 2.07.34 11.61 3.34 8.72 1.5-1.44 1.5-7.25 1.87-9.22.75-3.91 1.47-7.85 2.72-11.64 2.2-6.68 4.8-13.8 10.3-18.4 3.53-2.94 6-6.93 9.4-9.9 1.5-1.35.35-1.2 2.8-1.03q2.44.16 4.9.2c3.8.1 7.6.08 11.4.1 7.63 0 15.24.1 22.89-.3 3.4-.2 6.8-.3 10.17-.6 1.9-.2 5.25-1.4 6.8-.5 1.43.84 2.9 3.61 3.94 4.75 2.4 2.67 5.3 4.72 8.12 6.92 5.9 4.57 8.86 10.33 10.65 17.48 1.8 7.13 1.3 13.75 3.5 20.76.38 1.24 1.4 3.36 2.67 1.46.25-.36.2-2.3.2-3.42 0-4.52 1.13-7.9 1.12-12.46-.06-13.83-.5-31.87-10.85-42.44", fill: { type: "color", name: "hair" } } }] }, shortRound: { elements: [{ name: "path", type: "element", attributes: { "fill-rule": "evenodd", "clip-rule": "evenodd", d: "M166.3 35c-20.18-11.7-40.17-9.78-55.26-5.97-15.1 3.8-24.02 14.62-31.68 30.62a68 68 0 0 0-6.34 25.83 34 34 0 0 0 1.25 10.22c.33 1.2 2.15 5.39 2.65 2 .17-1.12-.44-2.67-.5-3.86-.08-1.57 0-3.16.11-4.73q.28-4.4 1.65-8.59c1.33-3.98 3.02-8.3 5.6-11.67 6.4-8.33 17.5-8.8 26.3-13.39-.78 1.4-3.7 3.68-2.7 5.27.7 1.1 3.37.76 4.64.72 3.35-.1 6.72-.67 10.02-1.14a72 72 0 0 0 15-4.1c4.02-1.5 8.61-2.88 11.63-6.07a69 69 0 0 0 17.4 13c5.62 2.88 14.68 4.32 18.11 10.16 4.07 6.9 2.2 15.4 3.44 22.9.47 2.85 1.54 2.79 2.13.24 1-4.33 1.47-8.83 1.15-13.28-.72-10.05-4.4-36.45-24.6-48.15", fill: { type: "color", name: "hair" } } }] }, shortWaved: { elements: [{ name: "path", type: "element", attributes: { "fill-rule": "evenodd", "clip-rule": "evenodd", d: "M182.68 38.95c5.4-4.95 6.7-14.99 3.64-21.5-3.77-8-11.42-9-18.75-5.48-6.9 3.31-13.06 4.42-20.62 2.81-7.26-1.54-14.14-4.26-21.65-4.7-12.32-.74-24.3 3.83-32.7 13.05a36 36 0 0 0-4.11 5.8c-.98 1.63-2.08 3.38-2.5 5.26-.2.9.18 3.1-.27 3.83-.48.8-2.3 1.52-3.07 2.1a25 25 0 0 0-4.18 4.05c-2.66 3.22-4.13 6.59-5.37 10.57-4.1 13.25-4.45 29 .86 42 .7 1.74 2.9 5.36 4.18 1.64.26-.73-.33-3.19-.33-3.93 0-2.72 1.5-20.73 8.05-30.82 2.13-3.28 11.97-15.58 13.98-15.68 1.07 1.7 11.88 12.51 39.94 11.24 12.66-.59 22.4-6.28 24.74-8.74 1.03 5.53 13 13.81 14.82 17.22 5.26 9.85 6.43 30.3 8.44 30.27s3.45-5.24 3.87-6.23c3.07-7.38 3.6-16.64 3.26-24.56-.42-10.2-4.63-21.23-12.23-28.22", fill: { type: "color", name: "hair" } } }] }, sides: { elements: [{ name: "path", type: "element", attributes: { d: "M69 97c0 4 .92 5.07 6 5 3.25-.05 3.44-6 3.65-12.59.14-4.37.29-9.03 1.35-12.41.62-4.43-1.82-3.17-3-1-3.96 4.78-8 15.34-8 21m126 0c0 4-.92 5.07-6 5-3.25-.05-3.44-6-3.65-12.59-.14-4.37-.29-9.03-1.35-12.41-.62-4.43 1.82-3.17 3-1 3.96 4.78 8 15.34 8 21", fill: { type: "color", name: "hair" } } }] }, straight01: { elements: [{ name: "path", type: "element", attributes: { d: "M66 113c10.86-22.7 34.67-31.6 55.44-39.36 13.32-4.97 25.39-9.48 32-16.86 2.22 2.02 4.75 4.05 7.41 6.2C171.06 71.16 183.2 80.91 188 98v.17a12 12 0 0 1 9.81 9.72V86.04q0-1.94-.15-3.84c4.54-17-3.1-37.78-12.66-47.2-9.48-8.82-22.3-12.32-30.95-8.48C142.45 8.98 108.9 13.24 89 28c-13.22 9.8-24.79 25.72-27.84 45.75A46 46 0 0 0 60 84.05v88.5c-.2 31.5-7.4 82.49-21 90.45 62.36 16.8 71.93-38.15 69-82v-.39a56 56 0 0 1-31.8-45.74A12 12 0 0 1 66 123zm90 67.61a56 56 0 0 0 31.8-45.74 12 12 0 0 0 10.01-9.76v1.36A100 100 0 0 0 208.79 172l26.95 52.71a37.8 37.8 0 0 1-3.94 40.76A72 72 0 0 0 160 199h-4z", fill: { type: "color", name: "hair" } } }, { name: "path", type: "element", attributes: { d: "M66 113c10.86-22.7 34.67-31.6 55.44-39.36 13.32-4.97 25.39-9.48 32-16.86 2.22 2.02 4.75 4.05 7.41 6.2 10.19 8.17 22.3 17.9 27.11 34.9-4.57-14.04-15.75-21.22-25.6-27.55-3.21-2.06-6.28-4.03-8.93-6.12-6.6 6.4-18.67 10.32-32 14.64C100.68 85.58 76.87 93.3 66 113", fill: "black", "fill-opacity": ".16" } }] }, straight02: { elements: [{ name: "path", type: "element", attributes: { d: "M156 180.61V199h4a71.7 71.7 0 0 1 46 16.6V92a74 74 0 0 0-148 0v183.72A28 28 0 0 0 82 248v-45.58a72 72 0 0 1 22-3.42h4v-18.39a56.2 56.2 0 0 1-26-25.36V93.27a150 150 0 0 0 28.34-12.77c15.4-8.9 28.1-19.56 36.73-30.1 1.76 5.2 4.1 10.4 7.04 15.48 8.8 15.2 21.15 26.35 33.9 32.04v.25q.6.1 1.2.26 1.17.48 2.34.9A12 12 0 0 1 198 110v13a12 12 0 0 1-10.22 11.87A56 56 0 0 1 156 180.6", fill: { type: "color", name: "hair" } } }, { name: "path", type: "element", attributes: { d: "M156 199v-18.39a56 56 0 0 0 31.8-45.74A12 12 0 0 0 198 123v-13a12 12 0 0 0-6.5-10.66 45 45 0 0 0 14.5 2.8v113.47A71.7 71.7 0 0 0 160 199zm-74 3.42v-47.17a56.2 56.2 0 0 0 26 25.36V199h-4c-7.67 0-15.07 1.2-22 3.42m106-104.5v.25q.6.1 1.18.26z", fill: "black", "fill-opacity": ".27" } }] }, straightAndStrand: { elements: [{ name: "path", type: "element", attributes: { d: "M132 18a74 74 0 0 0-74 74v96c0 8.56 1.45 16.78 4.13 24.42A71.7 71.7 0 0 1 104 199h4v-18.39a56 56 0 0 1-31.8-45.74A12 12 0 0 1 66 123v-13a12 12 0 0 1 .46-3.3c17.13-6.02 33.75-21.94 43.59-44.04l1.18-2.76q6.87 18.34 25.89 26.64a87 87 0 0 1-12.45-20.79c7.98 8.5 18.35 16.74 30.48 23.75 14.33 8.27 28.91 13.56 41.87 15.75q.96 2.2.98 4.75v13a12 12 0 0 1-10.2 11.87A56 56 0 0 1 156 180.6V199h4a71.7 71.7 0 0 1 41.88 13.42A74 74 0 0 0 206 188V92a74 74 0 0 0-74-74", fill: { type: "color", name: "hair" } } }, { name: "path", type: "element", attributes: { d: "M110.05 62.66C98.59 88.39 77.95 105.75 58 108.84v4c19.95-3.1 40.59-20.45 52.05-46.18l1.18-2.76q6.87 18.35 25.89 26.63a78 78 0 0 1-4.62-6.26q-15.27-8.35-21.27-24.37a99 99 0 0 1-1.18 2.76m18.45 10.98a137 137 0 0 0 26.65 19.86c17.75 10.25 35.9 15.9 50.85 16.78v-4c-14.95-.87-33.1-6.54-50.85-16.78-12.13-7-22.5-15.24-30.48-23.75a98 98 0 0 0 3.83 7.89", fill: "black", "fill-opacity": ".16" } }] }, theCaesar: { elements: [{ name: "path", type: "element", attributes: { "fill-rule": "evenodd", "clip-rule": "evenodd", d: "M75 98c.35 1.49 1.67 1.22 2 0-.46-1.55 3.3-28.75 13-36 3.62-2.52 23-4.77 42.31-4.75 19.1 0 38.11 2.26 41.69 4.75 9.7 7.25 13.46 34.45 13 36 .33 1.22 1.65 1.49 2 0 .72-10.3 0-63.73-57-63S74.28 87.7 75 98", fill: { type: "color", name: "hair" } } }] }, theCaesarAndSidePart: { elements: [{ name: "path", type: "element", attributes: { d: "M77 98c-.33 1.22-1.65 1.49-2 0-.72-10.3 0-62.27 57-63s57.72 52.7 57 63c-.35 1.49-1.67 1.22-2 0 .46-1.55-3.3-28.75-13-36-1.76-1.22-7.25-2.39-14.64-3.26L163 50l-6.98 8.38c-7.03-.7-15.36-1.13-23.7-1.13C113 57.23 93.62 59.48 90 62c-9.7 7.25-13.46 34.45-13 36", fill: { type: "color", name: "hair" } } }] }, turban: { elements: [{ name: "path", type: "element", attributes: { d: "M189.47 97.5q1.51-3.62 1.53-7.5c0-18.23-26.41-33-59-33-32.58 0-59 14.77-59 33q.02 3.88 1.53 7.5C80.6 82.89 104.03 72 132 72s51.4 10.89 57.47 25.5", fill: "#EDECE3" } }, { name: "path", type: "element", attributes: { d: "M48 94.32C47.93 133.5 77 141 77 141c-5.44-49.55 23.54-65.15 46.53-77.53 2.94-1.58 5.78-3.11 8.44-4.65a310 310 0 0 0 8.48 4.68C163.43 75.87 192.42 91.48 187 141c0 0 29.07-8.46 29-46.68C215.92 47.15 163.85 3 134 3q-1 0-2 .09-1-.1-2-.09c-29.93 0-81.92 44.15-82 91.32", fill: { type: "color", name: "hat" } } }, { name: "path", type: "element", attributes: { d: "M48.01 95.9c.7 37.8 29 45.1 29 45.1s-29.05-7.07-29-43.97zm28.32 33.78c.15-37.86 26.18-51.05 47.2-61.71 11-5.58 20.64-10.47 24.47-17.83 4.13-7.25 5.39-13.94 4.65-19.67A39 39 0 0 1 148 44.54c-3.83 7.82-13.47 13-24.47 18.93-21.14 11.38-47.35 25.49-47.2 66.21", fill: "black", "fill-opacity": ".16" } }] }, winterHat02: { elements: [{ name: "path", type: "element", attributes: { d: "M196 168h-2v56.06a9 9 0 1 0 2 0zm-126 8h-2v56.06a9 9 0 1 0 2 0z", fill: "#F4F4F4" } }, { name: "circle", type: "element", attributes: { cx: "132", cy: "20", r: "20", fill: "#F4F4F4" } }, { name: "path", type: "element", attributes: { d: "M92.45 77.53h79.1c6.08 0 9.82 2.93 9.82 9V166c0 30.46 22.63 30.41 22.63 10.92v-73.86C204 68.8 186.77 21 132 21s-72 47.8-72 82.05v73.86c0 19.5 22.63 19.54 22.63-10.92V86.53c0-6.07 3.73-9 9.82-9", fill: { type: "color", name: "hat" } } }, { name: "path", type: "element", attributes: { d: "M197.67 67H66.33c9.1-24.5 28.93-46 65.67-46s56.58 21.5 65.67 46", fill: "black", "fill-opacity": ".2" } }, { name: "path", type: "element", attributes: { d: "M90.2 33.73 101.5 50 114 32H92.66q-1.25.84-2.46 1.73M171.34 32H151l12.5 18 10.95-15.77q-1.5-1.15-3.11-2.23M132.5 50 120 32h25z", fill: "white", "fill-opacity": ".5" } }, { name: "path", type: "element", attributes: { d: "M98 59 85.5 41 73 59zm31 0-12.5-18L104 59zm18.5-18L160 59h-25zM191 59l-12.5-18L166 59z", fill: "black", "fill-opacity": ".5" } }] }, winterHat03: { elements: [{ name: "circle", type: "element", attributes: { cx: "132", cy: "20", r: "20", fill: "#F4F4F4" } }, { name: "path", type: "element", attributes: { "fill-rule": "evenodd", "clip-rule": "evenodd", d: "M66 78a66 66 0 1 1 132 0v5H66z", fill: { type: "color", name: "hat" } } }, { name: "path", type: "element", attributes: { "fill-rule": "evenodd", "clip-rule": "evenodd", d: "M63 69.77a7 7 0 0 1 3.05-5.96c7.8-5.17 30.42-17.8 66.02-17.8s58.14 12.63 65.9 17.82a7 7 0 0 1 3.03 5.95v30.2c0 3.3-3.9 5.38-6.78 3.75C183.84 97.82 162.1 88 132.8 88a133.6 133.6 0 0 0-63.17 15.98c-2.85 1.56-6.63-.5-6.63-3.75z", fill: "black", "fill-opacity": ".1" } }, { name: "path", type: "element", attributes: { "fill-rule": "evenodd", "clip-rule": "evenodd", d: "M63 67.77a7 7 0 0 1 3.05-5.96c7.8-5.17 30.42-17.8 66.02-17.8s58.14 12.63 65.9 17.82a7 7 0 0 1 3.03 5.95v30.2c0 3.3-3.9 5.38-6.78 3.75C183.84 95.82 162.1 86 132.8 86a133.6 133.6 0 0 0-63.17 15.98c-2.85 1.56-6.63-.5-6.63-3.75z", fill: "#F4F4F4" } }] }, winterHat04: { elements: [{ name: "path", type: "element", attributes: { d: "M66 65c0-8.16 1.6-15.95 4.5-23.06-3.86-8.95-8.33-22.96-3.86-32.82 8-2.43 17.8 1.33 25.63 5.73A60.7 60.7 0 0 1 127 4h10c12.91 0 24.9 4.01 34.75 10.86 7.84-4.4 17.66-8.17 25.67-5.74 4.47 9.88-.03 23.94-3.9 32.88A61 61 0 0 1 198 65v8H66z", fill: { type: "color", name: "hat" } } }, { name: "path", type: "element", attributes: { d: "M193.52 42c3.87-8.94 8.37-23 3.9-32.88-8-2.43-17.83 1.34-25.66 5.74A61 61 0 0 1 193.52 42M92.27 14.85c-7.83-4.4-17.63-8.16-25.63-5.73-4.47 9.86 0 23.87 3.87 32.82 4.5-11 12.12-20.4 21.76-27.1", fill: "black", "fill-opacity": ".24" } }, { name: "path", type: "element", attributes: { d: "M189.2 33.42c1.99-6 3.5-12.86 1.49-16.1-2.67-1.16-7.59.47-12.4 2.77a61 61 0 0 1 10.9 13.33M85.66 20.14c-4.92-2.38-10-4.11-12.73-2.93-2.06 3.33-.42 10.47 1.64 16.59a61 61 0 0 1 11.1-13.66", fill: "white", "fill-opacity": ".3" } }, { name: "path", type: "element", attributes: { "fill-rule": "evenodd", "clip-rule": "evenodd", d: "M63 69.77a7 7 0 0 1 3.05-5.96c7.8-5.16 30.42-17.8 66.02-17.8s58.14 12.64 65.9 17.83a7 7 0 0 1 3.03 5.95v30.2c0 3.3-3.9 5.38-6.78 3.75C183.84 97.82 162.1 88 132.8 88a133.6 133.6 0 0 0-63.17 15.98c-2.85 1.56-6.63-.5-6.63-3.75z", fill: "black", "fill-opacity": ".1" } }, { name: "path", type: "element", attributes: { "fill-rule": "evenodd", "clip-rule": "evenodd", d: "M63 67.77a7 7 0 0 1 3.05-5.96c7.8-5.16 30.42-17.8 66.02-17.8s58.14 12.64 65.9 17.83a7 7 0 0 1 3.03 5.95v30.2c0 3.3-3.9 5.38-6.78 3.75C183.84 95.82 162.1 86 132.8 86a133.6 133.6 0 0 0-63.17 15.98c-2.85 1.56-6.63-.5-6.63-3.75z", fill: "#F4F4F4" } }] }, winterHat1: { elements: [{ name: "path", type: "element", attributes: { d: "M85.67 68H63v112.91a4.1 4.1 0 0 0 4.09 4.1 18.6 18.6 0 0 0 18.58-18.6zM201 68h-22.67v112.91a4.1 4.1 0 0 0 4.09 4.1 18.6 18.6 0 0 0 18.58-18.6z", fill: "#F4F4F4" } }, { name: "path", type: "element", attributes: { d: "M62 64a44 44 0 0 1 44-44h52a44 44 0 0 1 44 44v104.6a16.4 16.4 0 0 1-16.4 16.4 3.6 3.6 0 0 1-3.6-3.6V74H82v94.6A16.4 16.4 0 0 1 65.6 185a3.6 3.6 0 0 1-3.6-3.6z", fill: { type: "color", name: "hat" } } }, { name: "rect", type: "element", attributes: { x: "73", y: "52", width: "118", height: "36", rx: "8", fill: "black", "fill-opacity": ".1" } }, { name: "rect", type: "element", attributes: { x: "73", y: "50", width: "118", height: "36", rx: "8", fill: "#F4F4F4" } }] } } } }, colors: { accessories: { notEqualTo: ["background"], values: ["#262e33", "#65c9ff", "#5199e4", "#25557c", "#e6e6e6", "#929598", "#3c4f5c", "#b1e2ff", "#a7ffc4", "#ffdeb5", "#ffafb9", "#ffffb1", "#ff488e", "#ff5c5c", "#ffffff"] }, clothes: { notEqualTo: ["background", "skin"], values: ["#262e33", "#65c9ff", "#5199e4", "#25557c", "#e6e6e6", "#929598", "#3c4f5c", "#b1e2ff", "#a7ffc4", "#ffafb9", "#ffffb1", "#ff488e", "#ff5c5c", "#ffffff"] }, facialHair: { notEqualTo: ["background", "skin"], values: ["#a55728", "#2c1b18", "#b58143", "#d6b370", "#724133", "#4a312c", "#f59797", "#ecdcbf", "#c93305", "#e8e1e1"] }, hair: { notEqualTo: ["background"], values: ["#a55728", "#2c1b18", "#b58143", "#d6b370", "#724133", "#4a312c", "#f59797", "#ecdcbf", "#c93305", "#e8e1e1"] }, hat: { notEqualTo: ["background", "skin"], values: ["#262e33", "#65c9ff", "#5199e4", "#25557c", "#e6e6e6", "#929598", "#3c4f5c", "#b1e2ff", "#a7ffc4", "#ffdeb5", "#ffafb9", "#ffffb1", "#ff488e", "#ff5c5c", "#ffffff"] }, skin: { notEqualTo: ["background"], values: ["#614335", "#d08b5b", "#ae5d29", "#edb98a", "#ffdbb4", "#fd9841", "#f8d25c"] } } };

// node_modules/@dicebear/styles/dist/avataaars-neutral.min.json
var avataaars_neutral_min_default = { $id: "https://cdn.hopjs.net/npm/@dicebear/styles@10.4.0/dist/avataaars-neutral.min.json", $schema: "https://cdn.hopjs.net/npm/@dicebear/schema@1.3.0/dist/definition.min.json", $comment: "This file was generated by the DiceBear Exporter for Figma. https://www.figma.com/community/plugin/1005765655729342787", meta: { license: { name: "Free for personal and commercial use.", url: "https://avataaars.com/", text: "Remix of \u201EAvataaars\u201D (https://avataaars.com/) by \u201EPablo Stanley\u201D, licensed under \u201EFree for personal and commercial use.\u201D (https://avataaars.com/)" }, creator: { name: "Pablo Stanley", url: "https://twitter.com/pablostanley" }, source: { name: "Avataaars", url: "https://avataaars.com/" } }, canvas: { elements: [{ name: "mouth", type: "component", attributes: { transform: "translate(10 69)" } }, { name: "nose", type: "component", attributes: { transform: "translate(44 59)" } }, { name: "eyes", type: "component", attributes: { transform: "translate(14 27)" } }, { name: "eyebrows", type: "component", attributes: { transform: "translate(7.86 11)" } }], width: 112, height: 112 }, attributes: { fill: "none", "shape-rendering": "auto" }, components: { eyebrows: { width: 96.27, height: 24, variants: { angry: { elements: [{ name: "path", type: "element", attributes: { d: "M7.75 15.18c4.24-5.76 6.88-5.48 13.31-.62l.67.5c4.83 3.67 7.12 4.94 10.4 4.94a2 2 0 0 0 0-4c-2.06 0-3.9-1.02-7.98-4.12l-.68-.52C19.71 8.53 17.51 7.3 14.77 7c-3.68-.4-7.05 1.48-10.24 5.83a2 2 0 1 0 3.22 2.36m80.78 0c-4.24-5.77-6.88-5.49-13.32-.63l-.67.5c-4.82 3.67-7.1 4.94-10.4 4.94a2 2 0 0 1 0-4c2.06 0 3.9-1.02 7.99-4.12l.67-.52C76.56 8.53 78.76 7.3 81.5 7c3.68-.4 7.06 1.48 10.25 5.83a2 2 0 1 1-3.22 2.36", fill: "black", "fill-opacity": ".6" } }] }, angryNatural: { elements: [{ name: "path", type: "element", attributes: { "fill-rule": "evenodd", "clip-rule": "evenodd", d: "M11.43 5.01a7.2 7.2 0 0 0-6.44 2.43c-.6.73-1.55 2.48-1.5 3.42 0 .35.22.37 1.12.6 1.64.38 4.5-1.13 6.35-1 2.59.2 5.05 1.4 7.29 2.69 3.84 2.2 8.35 6.84 13.09 6.6.35-.02 5.42-1.74 4.4-2.72-.31-.49-3.02-1.13-3.5-1.36-2.16-1.09-4.36-2.45-6.43-3.72C21.28 9.18 16.86 5.6 11.42 5m73.62.01c2.37-.27 4.86.5 6.43 2.43.59.73 1.55 2.48 1.5 3.42 0 .35-.22.37-1.12.6-1.64.38-4.5-1.13-6.35-1-2.58.2-5.05 1.4-7.28 2.69-3.84 2.2-8.36 6.84-13.1 6.6-.35-.02-5.42-1.74-4.4-2.72.3-.49 3.03-1.13 3.5-1.36 2.17-1.09 4.36-2.45 6.44-3.72C75.19 9.18 79.6 5.6 85.04 5", fill: "black", "fill-opacity": ".6" } }] }, default: { elements: [{ name: "path", type: "element", attributes: { d: "M7.77 17.16c3.91-5.51 14.64-8.6 23.89-6.33a2 2 0 0 0 .95-3.88c-10.73-2.64-23.16.94-28.1 7.9a2 2 0 0 0 3.3 2.3m80.73.01c-3.9-5.5-14.64-8.6-23.9-6.33a2 2 0 0 1-.94-3.88c10.74-2.64 23.17.94 28.1 7.9a2 2 0 0 1-3.25 2.3", fill: "black", "fill-opacity": ".6" } }] }, defaultNatural: { elements: [{ name: "path", type: "element", attributes: { "fill-rule": "evenodd", "clip-rule": "evenodd", d: "M18.68 6.15c-5.8.27-15.2 4.49-14.95 10.34 0 .15.3.24.43.1 2.75-2.97 22.31-5.96 29.2-4.37.63.14 1.11-.48.71-.93-3.42-3.82-10.17-5.4-15.39-5.15m59.91 0c5.8.27 15.2 4.49 14.95 10.34 0 .15-.29.24-.42.1-2.76-2.97-22.32-5.96-29.2-4.37-.64.14-1.12-.48-.72-.93 3.42-3.84 10.2-5.42 15.4-5.17", fill: "black", "fill-opacity": ".6" } }] }, flatNatural: { elements: [{ name: "path", type: "element", attributes: { "fill-rule": "evenodd", "clip-rule": "evenodd", d: "M30.8 11.1c-5 .35-9.93.08-14.92-.13-3.83-.16-7.72-.68-11.37 1-.7.33-4.53 2.29-4.45 3.36.08.85 3.94 2.2 4.64 2.44 3.66 1.29 7.18.9 10.95.66 4.63-.27 9.23-.07 13.86-.2 3.18-.1 7.98-.63 9.5-4.4.48-1.14.1-3.42-.34-4.66-.2-.5-.72-.69-1.13-.4a15 15 0 0 1-6.68 2.32m34.67 0c4.99.36 9.9.09 14.9-.12 3.83-.16 7.72-.68 11.38 1 .7.33 4.53 2.29 4.44 3.36-.07.85-3.94 2.2-4.63 2.44-3.67 1.29-7.18.9-10.96.66-4.62-.27-9.23-.07-13.86-.2-3.11-.1-7.91-.63-9.45-4.4-.47-1.14-.1-3.42.36-4.66.18-.5.72-.69 1.12-.4a15 15 0 0 0 6.7 2.32", fill: "black", "fill-opacity": ".6" } }] }, frownNatural: { elements: [{ name: "path", type: "element", attributes: { "fill-rule": "evenodd", "clip-rule": "evenodd", d: "M28.5 6.88c-1.96 2.9-5.54 4.64-8.73 5.68-3.94 1.29-18.55 3.38-15.11 11.35.05.12.22.12.27 0 1.15-2.65 17.46-5.12 18.97-5.7 4.45-1.71 8.4-5.5 9.16-10.55.36-2.31-.63-6.05-1.54-7.55-.1-.18-.38-.13-.43.07-.36 1.33-1.4 4.97-2.58 6.7m39.28 0c1.97 2.9 5.54 4.64 8.74 5.68 3.96 1.29 18.57 3.38 15.13 11.35a.15.15 0 0 1-.28 0c-1.15-2.65-17.46-5.12-18.97-5.7-4.44-1.71-8.4-5.5-9.16-10.55-.35-2.31.64-6.05 1.55-7.55.1-.18.37-.13.43.07.35 1.33 1.4 4.97 2.57 6.7", fill: "black", "fill-opacity": ".6" } }] }, raisedExcited: { elements: [{ name: "path", type: "element", attributes: { d: "M8.11 17.13C9.61 7.6 22.2 1.1 31.31 5.3a2 2 0 0 0 1.66-3.63C21.5-3.63 6.07 4.33 4.17 16.5a2 2 0 1 0 3.94.63m80.05 0C86.66 7.6 74.08 1.1 64.97 5.3a2 2 0 0 1-1.67-3.63c11.5-5.3 26.9 2.66 28.81 14.83a2 2 0 0 1-3.95.63", fill: "black", "fill-opacity": ".6" } }] }, raisedExcitedNatural: { elements: [{ name: "path", type: "element", attributes: { "fill-rule": "evenodd", "clip-rule": "evenodd", d: "m14.9 1.58.91-.4C21.06-.9 29-.03 33.86 2.3c.57.27.18 1.15-.4 1.1C18.54 2.27 8.5 11.56 5.08 17.86c-.1.18-.4.2-.48.03C2.3 12.56 9.05 3.9 14.9 1.58m66.47 0-.91-.4C75.22-.9 67.27-.03 62.4 2.3c-.56.27-.18 1.15.4 1.1 14.93-1.14 24.98 8.15 28.4 14.45.1.18.4.2.47.03 2.3-5.32-4.45-13.98-10.3-16.3", fill: "black", "fill-opacity": ".6" } }] }, sadConcerned: { elements: [{ name: "path", type: "element", attributes: { d: "M30.17 5.6c-1.48 8.38-14.1 14.17-23.24 10.42a2.04 2.04 0 0 0-2.63 1c-.44.97.03 2.1 1.05 2.5 11.44 4.7 26.83-2.37 28.76-13.3a1.9 1.9 0 0 0-1.64-2.2 2 2 0 0 0-2.3 1.57m35.93 0c1.5 8.39 14.1 14.18 23.25 10.43 1.01-.41 2.2.03 2.62 1s-.03 2.1-1.04 2.5c-11.45 4.7-26.84-2.37-28.77-13.3a1.9 1.9 0 0 1 1.65-2.2 2 2 0 0 1 2.32 1.57", fill: "black", "fill-opacity": ".6" } }] }, sadConcernedNatural: { elements: [{ name: "path", type: "element", attributes: { "fill-rule": "evenodd", "clip-rule": "evenodd", d: "m23.37 20.42-.91.4c-5.24 2.09-13.2 1.21-18.06-1.12-.56-.27-.18-1.15.4-1.1 14.92 1.14 24.97-8.15 28.38-14.45.1-.18.4-.2.48-.03 2.31 5.32-4.45 13.98-10.3 16.3m49.54 0 .9.4c5.26 2.09 13.2 1.2 18.06-1.12.57-.27.18-1.15-.4-1.1-14.92 1.14-24.96-8.15-28.38-14.45-.1-.18-.4-.2-.48-.03-2.3 5.32 4.45 13.98 10.3 16.3", fill: "black", "fill-opacity": ".6" } }] }, unibrowNatural: { elements: [{ name: "path", type: "element", attributes: { "fill-rule": "evenodd", "clip-rule": "evenodd", d: "M88.26 7.6c1.46.56 9.19 6.43 7.86 9.16a.8.8 0 0 1-1.29.22 11 11 0 0 0-1.7-1.2c-5.11-2.83-11.3-1.92-16.74-.9-6.12 1.14-12.1 3.48-18.38 2.67-2.04-.26-6.08-1.22-7.63-2.96-.47-.53-.06-1.38.64-1.43 1.44-.11 2.86-.86 4.33-1.28 3.65-1.03 7.4-1.56 11.11-2.3 6.62-1.3 15.17-4.52 21.8-2", fill: "#DADADA" } }, { name: "path", type: "element", attributes: { "fill-rule": "evenodd", "clip-rule": "evenodd", d: "M50.9 12.76c-1.17.04-2.8 3.56-.56 3.68 2.23.11 1.73-3.72.56-3.68m-3.76.04q0-.01 0 0M8.02 7.56c-1.47.56-9.2 6.43-7.87 9.16.24.5.9.6 1.3.22.54-.52 1.57-1.11 1.7-1.18 5.1-2.84 11.3-1.93 16.73-.91 6.12 1.15 12.1 3.49 18.4 2.68 2.03-.26 6.07-1.22 7.6-2.96.48-.53.08-1.38-.62-1.43-1.44-.11-2.86-.86-4.33-1.28-3.65-1.03-7.4-1.56-11.12-2.3-6.62-1.3-15.17-4.52-21.8-2", fill: "#DADADA" } }, { name: "path", type: "element", attributes: { "fill-rule": "evenodd", "clip-rule": "evenodd", d: "M47.1 11.79c1.18.04 2.77 4.5.54 4.67-2.24.18-1.7-4.71-.53-4.67", fill: "#DADADA" } }] }, upDown: { elements: [{ name: "path", type: "element", attributes: { d: "M7.73 14.16c4.5-6.32 14.01-9.5 23.75-6.36a2 2 0 1 0 1.23-3.81c-11.4-3.7-22.74.1-28.24 7.85a2 2 0 1 0 3.26 2.32m80.78 7c-3.91-5.51-14.64-8.6-23.89-6.33a2 2 0 0 1-.95-3.88c10.73-2.64 23.16.94 28.1 7.9a2 2 0 0 1-3.26 2.3", fill: "black", "fill-opacity": ".6" } }] }, upDownNatural: { elements: [{ name: "path", type: "element", attributes: { "fill-rule": "evenodd", "clip-rule": "evenodd", d: "m14.9 1.58.91-.4C21.06-.9 29-.03 33.86 2.3c.57.27.18 1.15-.4 1.1C18.54 2.27 8.5 11.56 5.08 17.86c-.1.18-.4.2-.48.03C2.3 12.56 9.05 3.9 14.9 1.58m64.23 10.49c5.76.77 14.75 5.8 14 11.6-.03.2-.32.26-.44.1-2.49-3.2-21.7-7.87-28.72-6.9-.64.1-1.06-.57-.62-.98 3.74-3.54 10.62-4.52 15.78-3.82", fill: "black", "fill-opacity": ".6" } }] } } }, eyes: { width: 84, height: 36.27, variants: { closed: { elements: [{ name: "path", type: "element", attributes: { "fill-rule": "evenodd", "clip-rule": "evenodd", d: "M2.16 19.55C4.01 23.35 8.16 26 13 26c4.81 0 8.96-2.63 10.82-6.4.55-1.13-.24-2.05-1.03-1.37a15 15 0 0 1-9.8 3.43c-3.73 0-7.12-1.24-9.55-3.23-.9-.73-1.82.01-1.28 1.12m58 0c1.85 3.8 6 6.45 10.84 6.45 4.81 0 8.96-2.63 10.82-6.4.55-1.13-.24-2.05-1.03-1.37a15 15 0 0 1-9.8 3.43c-3.76 0-7.15-1.24-9.58-3.23-.9-.73-1.82.01-1.28 1.12", fill: "black", "fill-opacity": ".6" } }] }, cry: { elements: [{ name: "path", type: "element", attributes: { d: "M11 19s-6 7.27-6 11.27a6 6 0 1 0 12 0c0-4-6-11.27-6-11.27", fill: "#92D9FF" } }, { name: "path", type: "element", attributes: { d: "M22 14a6 6 0 1 1-12 0 6 6 0 0 1 12 0m52 0a6 6 0 1 1-12 0 6 6 0 0 1 12 0", fill: "black", "fill-opacity": ".6" } }] }, default: { elements: [{ name: "path", type: "element", attributes: { d: "M22 14a6 6 0 1 1-12 0 6 6 0 0 1 12 0m52 0a6 6 0 1 1-12 0 6 6 0 0 1 12 0", fill: "black", "fill-opacity": ".6" } }] }, eyeRoll: { elements: [{ name: "path", type: "element", attributes: { d: "M30 14a14 14 0 1 1-28 0 14 14 0 0 1 28 0m52 0a14 14 0 1 1-28 0 14 14 0 0 1 28 0", fill: "white" } }, { name: "path", type: "element", attributes: { d: "M22 6a6 6 0 1 1-12 0 6 6 0 0 1 12 0m52 0a6 6 0 1 1-12 0 6 6 0 0 1 12 0", fill: "black", "fill-opacity": ".7" } }] }, happy: { elements: [{ name: "path", type: "element", attributes: { "fill-rule": "evenodd", "clip-rule": "evenodd", d: "M2.16 14.45C4.01 10.65 8.16 8 13 8c4.81 0 8.96 2.63 10.82 6.4.55 1.13-.24 2.05-1.03 1.37a15 15 0 0 0-9.8-3.43c-3.73 0-7.12 1.24-9.55 3.23-.9.73-1.82-.01-1.28-1.12m58 0C62.01 10.65 66.16 8 71 8c4.81 0 8.96 2.63 10.82 6.4.55 1.13-.24 2.05-1.03 1.37a15 15 0 0 0-9.8-3.43c-3.76 0-7.15 1.24-9.58 3.23-.9.73-1.82-.01-1.28-1.12", fill: "black", "fill-opacity": ".6" } }] }, hearts: { elements: [{ name: "path", type: "element", attributes: { d: "M21.96 2c-2.55 0-5.08 1.98-6.46 3.82C14.1 3.98 11.6 2 9.04 2 3.55 2 0 5.33 0 9.64c0 5.73 4.41 9.13 9.04 12.74 1.66 1.23 4.78 4.4 5.17 5.1.4.68 2.13.7 2.62 0 .47-.73 3.5-3.87 5.16-5.1 4.63-3.6 9.04-7 9.04-12.74C31 5.34 27.46 2 21.97 2m53 0c-2.55 0-5.08 1.98-6.46 3.82C67.1 3.98 64.6 2 62.04 2 56.54 2 53 5.33 53 9.64c0 5.73 4.41 9.13 9.04 12.74 1.66 1.23 4.78 4.4 5.17 5.1.38.68 2.1.7 2.58 0 .48-.73 3.5-3.87 5.17-5.1 4.63-3.6 9.04-7 9.04-12.74C84 5.34 80.45 2 74.96 2", fill: "#FF5353", "fill-opacity": ".8" } }] }, side: { elements: [{ name: "path", type: "element", attributes: { d: "M13 8c-4.84 0-9 2.65-10.84 6.45-.54 1.1.39 1.85 1.28 1.12a15 15 0 0 1 9.8-3.22 6 6 0 1 0 10.7 2.8 2 2 0 0 0-.12-.74l-.15-.38a6 6 0 0 0-1.64-2.48C19.9 9.32 16.5 8 13 8m58 0c-4.84 0-9 2.65-10.84 6.45-.54 1.1.39 1.85 1.28 1.12a15 15 0 0 1 9.8-3.22 6 6 0 1 0 10.7 2.8 2 2 0 0 0-.12-.74l-.15-.38a6 6 0 0 0-1.64-2.48C77.9 9.32 74.5 8 71 8", fill: "black", "fill-opacity": ".6" } }] }, squint: { elements: [{ name: "path", type: "element", attributes: { d: "M30 12.73c0 4.26-6.27 7.72-14 7.72S2 17 2 12.73 8.27 5 16 5s14 3.46 14 7.73m52 0c0 4.26-6.27 7.72-14 7.72S54 17 54 12.73 60.27 5 68 5s14 3.46 14 7.73", fill: "white" } }, { name: "path", type: "element", attributes: { d: "M18.82 20.3a25 25 0 0 1-5.64 0 6 6 0 1 1 5.64 0m52 0a25 25 0 0 1-5.64 0 6 6 0 1 1 5.64 0", fill: "black", "fill-opacity": ".7" } }] }, surprised: { elements: [{ name: "path", type: "element", attributes: { d: "M30 14a14 14 0 1 1-28 0 14 14 0 0 1 28 0m52 0a14 14 0 1 1-28 0 14 14 0 0 1 28 0", fill: "white" } }, { name: "path", type: "element", attributes: { d: "M22 14a6 6 0 1 1-12 0 6 6 0 0 1 12 0m52 0a6 6 0 1 1-12 0 6 6 0 0 1 12 0", fill: "black", "fill-opacity": ".7" } }] }, wink: { elements: [{ name: "path", type: "element", attributes: { d: "M22 14a6 6 0 1 1-12 0 6 6 0 0 1 12 0", fill: "black", "fill-opacity": ".6" } }, { name: "path", type: "element", attributes: { "fill-rule": "evenodd", "clip-rule": "evenodd", d: "M56.6 16.96c1.59-3.92 5.55-6.86 10.37-7.2 4.8-.33 9.12 2 11.24 5.64.63 1.1-.1 2.06-.93 1.43-2.6-1.93-6.15-3-10-2.73a15 15 0 0 0-9.33 3.9c-.84.79-1.81.11-1.35-1.03", fill: "black", "fill-opacity": ".6" } }] }, winkWacky: { elements: [{ name: "circle", type: "element", attributes: { cx: "68", cy: "14", r: "12", fill: "white" } }, { name: "circle", type: "element", attributes: { cx: "68", cy: "14", r: "6", fill: "black", "fill-opacity": ".7" } }, { name: "path", type: "element", attributes: { "fill-rule": "evenodd", "clip-rule": "evenodd", d: "M2.16 17.45C4.01 13.65 8.16 11 13 11c4.81 0 8.96 2.63 10.82 6.4.55 1.13-.24 2.05-1.03 1.37a15 15 0 0 0-9.8-3.43c-3.73 0-7.12 1.24-9.55 3.23-.9.73-1.82-.01-1.28-1.12", fill: "black", "fill-opacity": ".6" } }] }, xDizzy: { elements: [{ name: "path", type: "element", attributes: { d: "M20.5 22.7 15 17.2l-5.5 5.5c-.4.4-1.1.4-1.6 0l-1.6-1.6c-.4-.4-.4-1.1 0-1.6l5.5-5.5-5.5-5.5c-.4-.5-.4-1.2 0-1.6l1.6-1.6c.4-.4 1.1-.4 1.6 0l5.5 5.5 5.5-5.5c.4-.4 1.1-.4 1.6 0l1.6 1.6c.4.4.4 1.1 0 1.6L18.2 14l5.5 5.5c.4.4.4 1.1 0 1.6l-1.6 1.6c-.4.4-1.1.4-1.6 0m54 0L69 17.2l-5.5 5.5c-.4.4-1.1.4-1.6 0l-1.6-1.6c-.4-.4-.4-1.1 0-1.6l5.5-5.5-5.5-5.5c-.4-.5-.4-1.2 0-1.6l1.6-1.6c.4-.4 1.1-.4 1.6 0l5.5 5.5 5.5-5.5c.4-.4 1.1-.4 1.6 0l1.6 1.6c.4.4.4 1.1 0 1.6L72.2 14l5.5 5.5c.4.4.4 1.1 0 1.6l-1.6 1.6c-.4.4-1.1.4-1.6 0", fill: "black", "fill-opacity": ".6" } }] } } }, mouth: { width: 92, height: 38, variants: { concerned: { elements: [{ name: "path", type: "element", attributes: { "fill-rule": "evenodd", "clip-rule": "evenodd", d: "M27.12 23.87a19 19 0 0 1 37.77.09c.08.77-.77 2.04-1.85 2.04H29.1c-1.1 0-2.1-1.18-1.98-2.13", fill: "black", "fill-opacity": ".7" } }, { name: "path", type: "element", attributes: { d: "M61.59 26H30.4A11 11 0 0 1 46 19.2 11 11 0 0 1 61.6 26", fill: "#FF4F6D" } }, { name: "path", type: "element", attributes: { d: "M58.57 11.75A5 5 0 0 1 57 12H36q-1.22-.02-2.24-.53A19 19 0 0 1 46 7c4.82 0 9.22 1.8 12.57 4.75", fill: "white" } }] }, default: { elements: [{ name: "path", type: "element", attributes: { "fill-rule": "evenodd", "clip-rule": "evenodd", d: "M32 9a14 14 0 1 0 28 0", fill: "black", "fill-opacity": ".7" } }] }, disbelief: { elements: [{ name: "path", type: "element", attributes: { "fill-rule": "evenodd", "clip-rule": "evenodd", d: "M32 23a14 14 0 1 1 28 0", fill: "black", "fill-opacity": ".7" } }] }, eating: { elements: [{ name: "path", type: "element", attributes: { d: "M20 20.24q2.05.75 4.4.76c5.31 0 9.81-3.15 11.29-7.49 2.47 2.16 6.17 3.53 10.31 3.53s7.84-1.37 10.31-3.53C57.8 17.85 62.3 21 67.61 21q2.34-.01 4.4-.76h-.19c-6.33 0-11.8-4.9-11.8-10.56 0-4.18 2.32-7.72 5.7-9.68-5.5.8-9.74 5-9.9 10.1a17.6 17.6 0 0 1-9.8 2.8 17.5 17.5 0 0 1-9.8-2.8C36 5 31.8.8 26.3 0a11.2 11.2 0 0 1 5.68 9.68c0 5.66-5.47 10.57-11.8 10.57z", fill: "black", "fill-opacity": ".6", opacity: ".6" } }, { name: "path", type: "element", attributes: { d: "M9 18A9 9 0 1 0 9 0a9 9 0 0 0 0 18m74 0a9 9 0 1 0 0-18 9 9 0 0 0 0 18", fill: "#FF4646", "fill-opacity": ".2" } }] }, grimace: { elements: [{ name: "rect", type: "element", attributes: { x: "14", y: "1", width: "64", height: "26", rx: "13", fill: "black", "fill-opacity": ".6" } }, { name: "rect", type: "element", attributes: { x: "16", y: "3", width: "60", height: "22", rx: "11", fill: "white" } }, { name: "path", type: "element", attributes: { d: "M16.18 12H24V3.41A11 11 0 0 1 27 3h1v9h9V3h4v9h9V3h4v9h9V3h2q1.02 0 2 .18V12h8.82l.05.28v3.44l-.05.28H67v8.82q-.98.18-2 .18h-2v-9h-9v9h-4v-9h-9v9h-4v-9h-9v9h-1a11 11 0 0 1-3-.41V16h-7.82a11 11 0 0 1 0-4", fill: "#E6E6E6" } }] }, sad: { elements: [{ name: "path", type: "element", attributes: { "fill-rule": "evenodd", "clip-rule": "evenodd", d: "M32.06 21.72C32.7 14.7 38.7 10 46 10c7.34 0 13.36 4.75 13.95 11.85.03.38-.87.67-1.32.45Q50.32 18.14 46 18.14q-4.27 0-12.45 4.07c-.5.25-1.53-.07-1.5-.49", fill: "black", "fill-opacity": ".7" } }] }, screamOpen: { elements: [{ name: "path", type: "element", attributes: { "fill-rule": "evenodd", "clip-rule": "evenodd", d: "M26 32.86C27.14 18.88 30.24 7 46 7s18.92 11.94 20 26c.08 1.12-.83 2-1.96 2-6.69 0-9.37-2-18.05-2-8.7 0-13.26 2-17.9 2-1.17 0-2.2-.74-2.1-2.14", fill: "black", "fill-opacity": ".7" } }, { name: "path", type: "element", attributes: { d: "M59.02 11.57Q58.1 12 57 12H36c-.98 0-1.9-.28-2.67-.77C36.23 8.57 40.28 7 46 7c5.95 0 10.1 1.7 13.02 4.57", fill: "white" } }, { name: "path", type: "element", attributes: { d: "M61.8 34.92a44 44 0 0 1-5.54-.82c-2.73-.53-5.65-1.1-10.27-1.1-5.01 0-8.65.66-11.73 1.23-1.45.26-2.77.5-4.06.65A11 11 0 0 1 46 27.2a11 11 0 0 1 15.8 7.72", fill: "#FF4F6D" } }] }, serious: { elements: [{ name: "rect", type: "element", attributes: { x: "34", y: "12", width: "24", height: "6", rx: "3", fill: "black", "fill-opacity": ".7" } }] }, smile: { elements: [{ name: "path", type: "element", attributes: { "fill-rule": "evenodd", "clip-rule": "evenodd", d: "M27.12 9.13a19 19 0 0 0 37.77-.09c.08-.77-.77-2.04-1.85-2.04H29.1C28 7 27 8.18 27.12 9.13", fill: "black", "fill-opacity": ".7" } }, { name: "path", type: "element", attributes: { d: "M62 7H31a5 5 0 0 0 5 5h21a5 5 0 0 0 5-5", fill: "white" } }, { name: "path", type: "element", attributes: { d: "M58.7 21.14A11 11 0 0 0 46 19.2a10.95 10.95 0 0 0-12.7 1.94A19 19 0 0 0 46 26c4.88 0 9.33-1.84 12.7-4.86", fill: "#FF4F6D" } }] }, tongue: { elements: [{ name: "path", type: "element", attributes: { "fill-rule": "evenodd", "clip-rule": "evenodd", d: "M21 9.6C22.41 19.24 33.06 27 46 27c12.97 0 23.65-7.82 25-18.26.1-.4-.22-1.74-2.17-1.74H23.17c-1.79 0-2.3 1.24-2.17 2.6", fill: "black", "fill-opacity": ".7" } }, { name: "path", type: "element", attributes: { d: "M62 7H31a5 5 0 0 0 5 5h21a5 5 0 0 0 5-5", fill: "white" } }, { name: "path", type: "element", attributes: { d: "M35 17.5v9a11.5 11.5 0 1 0 23 0v-9c0-1.93-2.91-3.5-6.5-3.5-2.01 0-3.8.5-5 1.26a9.5 9.5 0 0 0-5-1.26c-3.59 0-6.5 1.57-6.5 3.5", fill: "#FF4F6D" } }] }, twinkle: { elements: [{ name: "path", type: "element", attributes: { d: "M32 10c0 5.37 6.16 9 14 9s14-3.63 14-9c0-1.1-.95-2-2-2-1.3 0-1.87.9-2 2-1.24 2.94-4.32 4.72-10 5-5.68-.28-8.76-2.06-10-5-.13-1.1-.7-2-2-2-1.05 0-2 .9-2 2", fill: "black", "fill-opacity": ".6" } }] }, vomit: { elements: [{ name: "path", type: "element", attributes: { "fill-rule": "evenodd", "clip-rule": "evenodd", d: "M26 24.4C27.14 13.9 30.24 5 46 5s18.92 8.96 20 19.5c.08.84-.83 1.5-1.96 1.5-6.69 0-9.37-1.5-18.05-1.5-8.7 0-13.25 1.5-17.9 1.5-1.16 0-2.2-.55-2.1-1.6", fill: "black", "fill-opacity": ".7" } }, { name: "path", type: "element", attributes: { d: "M59.86 9.1c-.8.57-1.8.9-2.86.9H36c-1.3 0-2.49-.5-3.38-1.31C35.56 6.39 39.8 5 46 5c6.54 0 10.9 1.54 13.86 4.1", fill: "white" } }, { name: "path", type: "element", attributes: { d: "M34 19a6 6 0 0 0-6 6v7a6 6 0 0 0 12 0v-2h.08a6 6 0 0 1 11.84 0H52a6 6 0 0 0 12 0v-5a6 6 0 0 0-6-6z", fill: "#7BB24B" } }, { name: "path", type: "element", attributes: { d: "M64 25a6 6 0 0 0-6-6H34a6 6 0 0 0-6 6v6a6 6 0 0 0 12 0v-2h.08a6 6 0 0 1 11.84 0H52a6 6 0 0 0 12 0z", fill: "#88C553" } }] } } }, nose: { width: 24, height: 8, variants: { default: { elements: [{ name: "path", type: "element", attributes: { "fill-rule": "evenodd", "clip-rule": "evenodd", d: "M0 0c0 4.42 5.37 8 12 8s12-3.58 12-8", fill: "black", "fill-opacity": ".16" } }] } } } }, colors: { background: { values: ["#614335", "#d08b5b", "#ae5d29", "#edb98a", "#ffdbb4", "#fd9841", "#f8d25c"] } } };

// src/services/avatar.js
var avataaars = new Style(avataaars_min_default);
var avataaarsNeutral = new Style(avataaars_neutral_min_default);
var dataUrlCache = /* @__PURE__ */ new Map();
var neutralDataUrlCache = /* @__PURE__ */ new Map();
function svgAvatar(style, seed) {
  return new Avatar(style, {
    borderRadius: 50,
    idRandomization: false,
    seed: String(seed)
  }).toString();
}
function getSvgAvatar(seed) {
  return svgAvatar(avataaars, seed);
}
function getNeutralSvgAvatar(seed) {
  return svgAvatar(avataaarsNeutral, seed);
}
function avatarDataUrl(cache, render, seed) {
  const key = String(seed);
  if (!cache.has(key)) {
    const svg = render(key);
    cache.set(key, `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
  }
  return cache.get(key);
}
async function seededAvatarDataUrl(seed) {
  return avatarDataUrl(dataUrlCache, getSvgAvatar, seed);
}
async function seededNeutralAvatarDataUrl(seed) {
  return avatarDataUrl(neutralDataUrlCache, getNeutralSvgAvatar, seed);
}

export {
  seededAvatarDataUrl,
  seededNeutralAvatarDataUrl
};
