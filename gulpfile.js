var gulp = require("gulp");

var testGlob = "src/**/*.test.js";

gulp.task("test", function () {
    var mocha = require("gulp-mocha");
    var mochaOptions = {
        ui: "tdd",
        bail: true
    };
    gulp.src(testGlob)
        .pipe(mocha(mochaOptions));
});

gulp.task("run", function () {
    require("./src/main");
});

gulp.task("default", ["run"]);
