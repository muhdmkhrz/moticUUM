function memberCardHTML(member) {
  return `
    <article class="member-card">
      <div
        class="member-card__avatar"
        aria-hidden="true"
      >
        ${member.name.charAt(0)}
      </div>

      <p class="member-card__position">
        ${member.position}
      </p>

      <h4 class="member-card__name">
        ${member.name}
      </h4>

      <a
        class="member-card__email"
        href="mailto:${member.email}"
      >
        ${member.email}
      </a>
    </article>
  `;
}

document.addEventListener(
  "DOMContentLoaded",
  () => {
    if (typeof teamData === "undefined") {
      return;
    }

    const topGrid = document.querySelector(
      "#top-committee-grid"
    );

    if (topGrid) {
      topGrid.innerHTML =
        teamData.topCommittee.members
          .map(memberCardHTML)
          .join("");
    }

    const departmentsList =
      document.querySelector(
        "#departments-list"
      );

    if (departmentsList) {
      departmentsList.innerHTML =
        teamData.departments
          .map(
            (department) => `
              <div class="department-group">
                <h3 class="team__group-title">
                  Exco ${department.name}
                </h3>

                <div class="team-grid">
                  ${department.members
                    .map(memberCardHTML)
                    .join("")}
                </div>
              </div>
            `
          )
          .join("");
    }
  }
);