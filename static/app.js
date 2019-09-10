(function() {
  function bindToggles() {
    var active;
    function toggle(id) {
      if (active) {
        dismiss(active);
      }
      if (active === id) {
        active = null;
        return;
      }
      active = id;
      var el = document.getElementById(id);
      el.classList.add("d-block");
      el.classList.remove("d-none");
    }
    function dismiss(id) {
      var el = document.getElementById(id);
      el.classList.add("d-none");
      el.classList.remove("d-block");
    }
    var toggles = document.querySelectorAll('[data-toggle]');
    for (var i = 0; i < toggles.length; i++) {
      toggles[i].addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        toggle(this.dataset.toggle);
      });
    }
    document.addEventListener('click', function() {
      if (active) {
        toggle(active);
      }
    });
  }

  document.addEventListener("page-refresh", function() {
    bindToggles();
  });
  window.addEventListener("load", function() {
    bindToggles();
  });
})();

function watcher(id, partial) {
  var previous = config.hash;
  function refresh() {
    fetch(window.location.href, {
        method: "GET",
        headers: { accept: "application/json" },
      })
      .then(function (resp) { return resp.json() })
      .then(function (data) {
        // Don't update the UI if we've already seen this data before.
        if (data.hash === previous) {
          console.log("watcher - no update");
          return;
        }
        console.log("watcher - updating");
        previous = data.hash;
        var el = document.getElementById(id);
        el.innerHTML = Handlebars.partials[partial](data);
        document.dispatchEvent(
          new CustomEvent("page-refresh", { detail: {} })
        );
      }).catch(function (err) {
        console.error(err);
      });
  }

  document.addEventListener("repo-update", function() {
    refresh();
  });
  document.addEventListener("watch-loaded", function() {
    document.dispatchEvent(
      new CustomEvent("repo-listen", { detail: config.repo })
    );
  });
}

(function() {
  if (config.page === "commit") {
    watcher("deploy_status_body", "deploy_status_body");
  }
  if (config.page === "commits") {
    watcher("commit_rows", "commit_rows");
  }
})();

function repoUpdated() {
  document.dispatchEvent(
    new CustomEvent("repo-update", { detail: config.repo })
  );
}
