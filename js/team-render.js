/* global teamData */

(() => {
  function normalisePosition(position) {
    return String(position || "Committee Member")
      .replace(/^Deputy /, "Vice ")
      .replace("Deputy Head", "Vice Head");
  }

  function fallbackSettings() {
    if (typeof teamData === "undefined") return null;

    const members = [];
    let id = 0;

    teamData.topCommittee?.members?.forEach((member, index) => {
      members.push({
        id: `fallback-${++id}`,
        group: "Majlis Tertinggi",
        position: normalisePosition(member.position),
        name: member.name,
        email: member.email,
        order: index + 1,
      });
    });

    teamData.departments?.forEach((department) => {
      department.members?.forEach((member, index) => {
        members.push({
          id: `fallback-${++id}`,
          group: department.name,
          position: normalisePosition(member.position),
          name: member.name,
          email: member.email,
          order: index + 1,
        });
      });
    });

    return { sessionLabel: "2025/2026", members };
  }

  function createMemberCard(member) {
    const article = document.createElement("article");
    article.className = "member-card";

    const avatar = document.createElement("div");
    avatar.className = "member-card__avatar";
    avatar.setAttribute("aria-hidden", "true");
    avatar.textContent = member.name?.trim().charAt(0).toUpperCase() || "M";

    const position = document.createElement("p");
    position.className = "member-card__position";
    position.textContent = normalisePosition(member.position);

    const name = document.createElement("h4");
    name.className = "member-card__name";
    name.textContent = member.name;

    const email = document.createElement("a");
    email.className = "member-card__email";
    email.href = `mailto:${member.email}`;
    email.textContent = member.email;

    article.append(avatar, position, name, email);
    return article;
  }

  function groupElementId(groupName, index) {
    const slug = String(groupName || "committee")
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

    return `committee-${slug || "group"}-${index + 1}`;
  }

  function setGroupOpen(section, shouldOpen) {
    const trigger = section.querySelector(".team-accordion__trigger");
    const panel = section.querySelector(".team-accordion__panel");

    if (!trigger || !panel) return;

    section.classList.toggle("is-open", shouldOpen);
    trigger.setAttribute("aria-expanded", String(shouldOpen));
    panel.hidden = !shouldOpen;
  }

  function createCommitteeGroup(groupName, members, index, accordionList) {
    const section = document.createElement("section");
    section.className = "team-accordion";

    const heading = document.createElement("h3");
    heading.className = "team-accordion__heading";

    const trigger = document.createElement("button");
    trigger.className = "team-accordion__trigger";
    trigger.type = "button";

    const triggerId = `${groupElementId(groupName, index)}-trigger`;
    const panelId = `${groupElementId(groupName, index)}-panel`;
    const isInitiallyOpen = index === 0;

    trigger.id = triggerId;
    trigger.setAttribute("aria-controls", panelId);
    trigger.setAttribute("aria-expanded", String(isInitiallyOpen));

    const label = document.createElement("span");
    label.className = "team-accordion__label";
    label.textContent = groupName === "Majlis Tertinggi"
      ? groupName
      : `Exco ${groupName}`;

    const chevron = document.createElement("span");
    chevron.className = "team-accordion__chevron";
    chevron.setAttribute("aria-hidden", "true");

    trigger.append(label, chevron);
    heading.append(trigger);

    const panel = document.createElement("div");
    panel.className = "team-accordion__panel";
    panel.id = panelId;
    panel.setAttribute("role", "region");
    panel.setAttribute("aria-labelledby", triggerId);
    panel.hidden = !isInitiallyOpen;

    const grid = document.createElement("div");
    grid.className = "team-grid";
    grid.append(...members.map(createMemberCard));

    panel.append(grid);
    section.append(heading, panel);
    section.classList.toggle("is-open", isInitiallyOpen);

    trigger.addEventListener("click", () => {
      const shouldOpen = trigger.getAttribute("aria-expanded") !== "true";

      if (shouldOpen) {
        accordionList
          .querySelectorAll(".team-accordion")
          .forEach((group) => setGroupOpen(group, false));
      }

      setGroupOpen(section, shouldOpen);
    });

    return section;
  }

  function renderSettings(settings) {
    const heading = document.querySelector("[data-team-heading]");
    const accordionList = document.querySelector("#committee-groups");

    if (!accordionList) return;

    if (heading) {
      heading.textContent = `Our Team, ${settings.sessionLabel}`;
    }

    const members = [...settings.members].sort((first, second) => {
      if (first.group === second.group) return Number(first.order) - Number(second.order);
      if (first.group === "Majlis Tertinggi") return -1;
      if (second.group === "Majlis Tertinggi") return 1;
      return first.group.localeCompare(second.group);
    });

    const departmentNames = [...new Set(
      members
        .filter((member) => member.group !== "Majlis Tertinggi")
        .map((member) => member.group)
    )];

    const groupNames = [
      ...(members.some((member) => member.group === "Majlis Tertinggi")
        ? ["Majlis Tertinggi"]
        : []),
      ...departmentNames,
    ];

    accordionList.replaceChildren(
      ...groupNames.map((groupName, index) => createCommitteeGroup(
        groupName,
        members.filter((member) => member.group === groupName),
        index,
        accordionList
      ))
    );
  }

  document.addEventListener("DOMContentLoaded", async () => {
    let settings = null;

    try {
      settings = window.newsService
        ? await window.newsService.getCommitteeSettings()
        : null;
    } catch (error) {
      console.warn("The live committee could not be loaded.", error);
    }

    renderSettings(settings || fallbackSettings() || {
      sessionLabel: "Current Session",
      members: [],
    });
  });
})();
