/*
 * TODO
 *   templates: @<foo> %map:{ my:specimen.container.code=.1.code, my:specimen.container.disp=.1.display %}
 *   node identifiers: @foo> %map:{ foo.id=substr(20) %}
 *   multiplicity: ...
 */
var N3 = require("n3");
var N3Util = N3.Util;
var ShExUtil = require("../lib/ShExUtil");

var MapExt = "http://shex.io/extensions/Map/#";
var pattern = /^ *(?:<([^>]*)>|([^:]*):([^ ]*)) *$/;
function register (validator) {
  var prefixes = validator.schema.prefixes;

  validator.semActHandler.results[MapExt] = {};
  validator.semActHandler.register(
    MapExt,
    {
      dispatch: function (code, ctx) {
        var m = code.match(pattern);
        if (!m) {
          throw Error("Invocation error: " + MapExt + " code \"" + code + "\" didn't match " + pattern);
        }
        var arg = m[1] ? m[1] : prefixes[m[2]] + m[3];
        validator.semActHandler.results[MapExt][arg] = ctx.object;
        return true;
      }
    }
  );
  return validator.semActHandler.results[MapExt];
}

function done (validator) {
  if (Object.keys(validator.semActHandler.results[MapExt]).length === 0)
    delete validator.semActHandler.results[MapExt];
}

function materializer (schema, nextBNode) {
  var blankNodeCount = 0;
  nextBNode = nextBNode || function () {
    return '_:b' + blankNodeCount++;
  };
  return {
    materialize: function (bindings, createRoot, target) {
      target = target || N3.Store();
      target.addPrefixes(schema.prefixes); // not used, but seems polite

      // utility functions for e.g. s = add(B(), P(":value"), L("70", P("xsd:float")))
      function P (pname) { return N3Util.expandPrefixedName(pname, schema.prefixes); }
      function L (value, modifier) { return N3Util.createLiteral(value, modifier); }
      function B () { return nextBNode(); }
      function add (s, p, o) { target.addTriple({ subject: s, predicate: p, object: o }); return s; }

      var curSubject = createRoot || B();

      var v = ShExUtil.Visitor();

      v.visitReference = function (r) {
        this.visitShape(schema.shapes[r], r);
        return this._visitValue(r);
      };

      v.visitTripleConstraint = function (expr) {
        var mapExts = (expr.semActs || []).filter(function (ext) { return ext.name === MapExt; });
        if (mapExts.length) {
          mapExts.forEach(function (ext) {
            var code = ext.code;
            var m = code.match(pattern);
            if (!m) {
              throw Error("Invocation error: " + MapExt + " code \"" + code + "\" didn't match " + pattern);
            }
            var arg = m[1] ? m[1] : P(m[2] + ":" + m[3]);
            add(curSubject, expr.predicate, bindings[arg]);
          });
        } else if ("values" in expr.valueExpr && expr.valueExpr.values.length === 1) {
          add(curSubject, expr.predicate, expr.valueExpr.values[0]);
        } else {
          var oldSubject = curSubject;
          curSubject = B();
          add(oldSubject, expr.predicate, curSubject);
          this._maybeSet(expr, { type: "TripleConstraint" }, "TripleConstraint",
                         ["inverse", "negated", "predicate", "valueExprRef", "valueExpr",
                          "min", "max", "annotations", "semActs"])
          curSubject = oldSubject;
        }
      };

      v.visitShape(schema.shapes[schema.start], schema.start);
      return target;
    }
  };
}

module.exports = {
  register: register,
  done: done,
  materializer: materializer,
  url: MapExt
};
