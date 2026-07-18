import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";

const html = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
const styles = readFileSync(new URL("../public/css/styles.css", import.meta.url), "utf8");
const document = new JSDOM(html).window.document;
const home = document.querySelector("#home-screen");
const utility = home?.querySelector(":scope > .home-utility-row");
const left = home?.querySelector(":scope > .home-widget-list--left");
const right = home?.querySelector(":scope > .home-widget-list--right");

function check(condition, description) {
  if (!condition) throw new Error(description);
}

check(utility?.children.length === 2, "The utility row should contain only coin and profile controls");
check(utility?.querySelector("#coin-holder"), "The utility row should retain the coin holder");
check(utility?.querySelector("#open-profile"), "The utility row should retain the profile button");
check(left?.querySelector(":scope > #daily-gifts-launcher"), "Daily Gifts should be in the left widget list");
check(right?.querySelectorAll(":scope > button").length === 2, "The right widget list should contain two entries");
check(right?.children[0]?.id === "open-leaderboard", "Leaderboard should be the first right widget");
check(right?.children[1]?.id === "open-battle-pass", "Battle Pass should be the second right widget");
check(/\.game \.home-widget-list\s*\{[^}]*position:\s*absolute[^}]*top:\s*50%[^}]*display:\s*flex[^}]*flex-direction:\s*column[^}]*gap:\s*38px[^}]*transform:\s*translateY\(-50%\)/s.test(styles), "Widget lists should be centered vertical stacks using the shared gap");
check(/\.game \.home-widget-list--left\s*\{[^}]*left:\s*-120px/s.test(styles), "The left list should own left-edge placement");
check(/\.game \.home-widget-list--right\s*\{[^}]*right:\s*-120px/s.test(styles), "The right list should own right-edge placement");
check(/\.game \.home-widget-list > button\s*\{[^}]*width:\s*112px[^}]*height:\s*112px/s.test(styles), "Widget items should share the established right-widget dimensions");

console.log("home side-widget structure and layout contract passed");
