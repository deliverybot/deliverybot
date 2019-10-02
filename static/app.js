// Configures javascript toggle behaviour.
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

  document.addEventListener("turbolinks:load", function() {
    bindToggles();
  });
  document.addEventListener("page-refresh", function() {
    bindToggles();
  });
  window.addEventListener("load", function() {
    bindToggles();
  });
})();

(function() {
  function watcher(partials, repo) {
    console.log("watching", partials, repo);
    var previous = "";
    function handleUpdate() {
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

          partials.forEach(function(partial) {
            var el = document.getElementById(partial);
            // If the element doesn't exist just continue:
            if (el) {
              el.innerHTML = Handlebars.partials[partial](data);
            }
          });

          document.dispatchEvent(
            new CustomEvent("page-refresh", { detail: {} })
          );
        }).catch(function (err) {
          console.error(err);
        });
    }

    function handleLoad() {
      document.dispatchEvent(
        new CustomEvent("repo-listen", { detail: repo })
      );
    }

    document.addEventListener("repo-update", handleUpdate);
    document.addEventListener("watch-loaded", handleLoad);
    return function() {
      document.removeEventListener("repo-update", handleUpdate);
      document.removeEventListener("watch-loaded", handleLoad);
    }
  }

  function getWatcher(watch) {
    if (watch.page === "commit") {
      return watcher(["deploy_status_body", "commit_status"], watch.repo);
    }
    if (watch.page === "commits") {
      return watcher(["commit_rows"], watch.repo);
    }
  }

  function repoUpdated() {
    document.dispatchEvent(
      new CustomEvent("repo-update", { detail: {} })
    );
  }

  var active;
  document.addEventListener("turbolinks:load", function() {
    fetch(window.location.href + "?watch=true")
      .then(function(resp) { return resp.json(); })
      .then(function(watch) {
        if (watch.watch) {
          console.log("fetching watch", watch);
          // Close off the active watcher.
          if (active) active();
          active = getWatcher(watch);
          console.log("triggering first update", watch);
          repoUpdated();
        }
      })
      .catch(function(err) { console.error(err); })
  });
})();
