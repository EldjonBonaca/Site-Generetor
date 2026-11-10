<?php
/**
 * Plugin Name: {{PLUGIN_NAME}}
 * Description: {{PLUGIN_DESCRIPTION}}
 * Version: {{VERSION}}
 * Requires at least: 6.2
 * Requires PHP: 7.4
 * License: GPL-2.0-or-later
 *
 * Generated file. On activation it opens Tools → {{MENU_TITLE}}, which creates the website:
 *  1. setup: Elementor (installed and activated: the plugin can be activated on a fresh WordPress),
 *     Hello Elementor theme (the other themes are deleted), Contact Form 7, Yoast SEO,
 *     LocalWeb All In One, Loginizer, WP Fastest Cache, Really Simple SSL, the premium plugins bundled in plugins/ and,
 *     without Elementor Pro or when the header menu is its Navigation Menu widget, Ultimate Addons
 *     for Elementor (UAE);
 *  2. images (Media Library), a few per request;
 *  3. the 5 pages (Home, About, Services, Gallery, Contact) built with Elementor, one article per
 *     service, the menu, the contact form, header/footer/single post templates, the template colors
 *     and the CSS of the whole site (Additional CSS of the theme).
 * Header and footer: Elementor Pro Theme Builder templates; without Pro, UAE Header Footer Builder
 * templates shown on the whole site, which keep working after this plugin is deleted. Only when UAE
 * cannot be installed this plugin displays them itself (Hello Elementor hooks).
 * Running it again updates what it created (tracked in the option OPTION).
 * When the site is created the plugin deactivates and deletes itself (step "cleanup"); when
 * WordPress does not allow it, a popup asks to delete it.
 */

namespace ESG\Site_{{HASH}};

if (!defined('ABSPATH')) {
	exit;
}

const OPTION = 'esg_site_{{HASH}}';
const PAGE = 'esg-site-{{HASH}}';
const SCHEME = 'esg-image://';
const IMAGES_PER_REQUEST = 3;
// Header / footer template ids displayed by this plugin when Elementor Pro is not active
const OPTION_HF = 'esg_site_{{HASH}}_hf';
// Plugins installed from wordpress.org: Elementor itself, the contact form, and the header/footer builder used without Elementor Pro
const ELEMENTOR = array('slug' => 'elementor', 'file' => 'elementor/elementor.php', 'name' => 'Elementor');
const CF7 = array('slug' => 'contact-form-7', 'file' => 'contact-form-7/wp-contact-form-7.php', 'name' => 'Contact Form 7');
const UAE = array('slug' => 'header-footer-elementor', 'file' => 'header-footer-elementor/header-footer-elementor.php', 'name' => 'Ultimate Addons for Elementor');
// SEO: the focus keyphrase, SEO title and meta description of every page and article are filled in
const YOAST = array('slug' => 'wordpress-seo', 'file' => 'wordpress-seo/wp-seo.php', 'name' => 'Yoast SEO');
// LocalWeb All In One, security (login protection), cache, SSL and anti-spam: installed and activated on every site
// (a plugin already installed, like the Akismet that comes with WordPress, is only activated)
const SITE_PLUGINS = array(
	array('slug' => 'akismet', 'file' => 'akismet/akismet.php', 'name' => 'Akismet Anti-spam'),
	array('slug' => 'lw-all-in-one', 'file' => 'lw-all-in-one/lw-all-in-one.php', 'name' => 'LocalWeb All In One'),
	array('slug' => 'loginizer', 'file' => 'loginizer/loginizer.php', 'name' => 'Loginizer'),
	array('slug' => 'wp-fastest-cache', 'file' => 'wp-fastest-cache/wpFastestCache.php', 'name' => 'WP Fastest Cache'),
	array('slug' => 'really-simple-ssl', 'file' => 'really-simple-ssl/rlrsssl-really-simple-ssl.php', 'name' => 'Really Simple SSL'),
);
// WhatsApp button, only when the project has it on (its number is in data/site.json)
const JOINCHAT = array('slug' => 'creame-whatsapp-me', 'file' => 'creame-whatsapp-me/joinchat.php', 'name' => 'Joinchat');

register_activation_hook(__FILE__, __NAMESPACE__ . '\\activate');
register_uninstall_hook(__FILE__, __NAMESPACE__ . '\\uninstall');
add_action('admin_init', __NAMESPACE__ . '\\redirect_after_activation');
add_action('admin_menu', __NAMESPACE__ . '\\admin_menu');
add_action('wp_ajax_' . PAGE, __NAMESPACE__ . '\\ajax_step');
add_filter('plugin_action_links_' . plugin_basename(__FILE__), __NAMESPACE__ . '\\action_links');
// Without Elementor Pro: header and footer of the site on every page (Hello Elementor theme)
add_filter('hello_elementor_header_footer', __NAMESPACE__ . '\\theme_header_footer');
add_action('wp_body_open', __NAMESPACE__ . '\\render_header', 5);
add_action('get_footer', __NAMESPACE__ . '\\render_footer', 5);
add_action('wp_enqueue_scripts', __NAMESPACE__ . '\\enqueue_header_footer');
// No comments on the articles (nor on the pages) of the site
add_filter('comments_open', __NAMESPACE__ . '\\no_comments', 20, 2);
add_filter('pings_open', __NAMESPACE__ . '\\no_comments', 20, 2);
add_filter('comments_array', __NAMESPACE__ . '\\no_comment_list', 20, 2);
add_action('init', __NAMESPACE__ . '\\remove_comment_support', 100);

// ---------------------------------------------------------------------------- data + state

function data() {
	static $data = null;
	if ($data === null) {
		$data = json_decode((string) file_get_contents(__DIR__ . '/data/site.json'), true);
		if (!is_array($data)) {
			throw new \RuntimeException('data/site.json is missing or invalid.');
		}
	}
	return $data;
}

function t($key, array $vars = array()) {
	$ui = data()['ui'];
	$text = isset($ui[$key]) ? $ui[$key] : $key;
	foreach ($vars as $name => $value) {
		$text = str_replace('{' . $name . '}', (string) $value, $text);
	}
	return $text;
}

/** IDs of everything this plugin created, so a new run updates instead of duplicating. */
function state() {
	$state = get_option(OPTION, array());
	$defaults = array('images' => array(), 'pages' => array(), 'posts' => array(), 'templates' => array(), 'uae' => array(), 'menu_items' => array(), 'form' => null, 'done_at' => 0);
	return is_array($state) ? array_merge($defaults, $state) : $defaults;
}

function save_state(array $state) {
	update_option(OPTION, $state, false);
}

function element_doc($file) {
	if (!$file) {
		return null;
	}
	$doc = json_decode((string) file_get_contents(__DIR__ . '/data/' . $file), true);
	return is_array($doc) ? $doc : null;
}

// ---------------------------------------------------------------------------- activation + admin page

function activate() {
	set_transient(OPTION . '_redirect', 1, 60);
}

function uninstall() {
	delete_option(OPTION);
	delete_option(OPTION_HF);
}

/** Right after activation open the plugin page, which starts creating the site. */
function redirect_after_activation() {
	if (!get_transient(OPTION . '_redirect')) {
		return;
	}
	delete_transient(OPTION . '_redirect');
	if (wp_doing_ajax() || is_network_admin() || isset($_GET['activate-multi']) || !current_user_can('manage_options')) {
		return;
	}
	wp_safe_redirect(admin_url('tools.php?page=' . PAGE . '&autorun=1'));
	exit;
}

function admin_menu() {
	add_management_page(t('heading'), t('menuTitle'), 'manage_options', PAGE, __NAMESPACE__ . '\\render_page');
}

function action_links($links) {
	array_unshift($links, '<a href="' . esc_url(admin_url('tools.php?page=' . PAGE)) . '">' . esc_html(t('open')) . '</a>');
	return $links;
}

function render_page() {
	$data = data();
	$state = state();
	$done = !empty($state['done_at']);
	$photos = count(array_filter($data['images'], function ($img) {
		return !empty($img['photo']);
	}));
	$config = array(
		'ajaxUrl' => admin_url('admin-ajax.php'),
		'action' => PAGE,
		'nonce' => wp_create_nonce(PAGE),
		'autorun' => !$done && !empty($_GET['autorun']),
		'ui' => $data['ui'],
		'urls' => array('home' => home_url('/'), 'plugins' => admin_url('plugins.php'), 'dashboard' => admin_url()),
	);
	?>
	<div class="wrap">
		<h1><?php echo esc_html(t('heading')); ?></h1>
		<p><?php echo esc_html(t('intro')); ?></p>
		<table class="widefat striped" style="max-width:760px">
			<tbody>
				<tr>
					<th><?php echo esc_html(t('pages')); ?></th>
					<td><?php echo esc_html(implode(' · ', wp_list_pluck($data['pages'], 'title'))); ?></td>
				</tr>
				<tr>
					<th><?php echo esc_html(t('posts', array('category' => $data['category']['name']))); ?></th>
					<td><?php echo esc_html(implode(' · ', wp_list_pluck($data['posts'], 'title')) ?: '—'); ?></td>
				</tr>
				<tr>
					<th><?php echo esc_html(t('images')); ?></th>
					<td><?php echo esc_html(t('imagesCount', array('total' => count($data['images']), 'photos' => $photos))); ?></td>
				</tr>
				<tr>
					<th><?php echo esc_html(t('templates')); ?></th>
					<td><?php echo esc_html(implode(' · ', wp_list_pluck($data['templates'], 'title')) ?: '—'); ?></td>
				</tr>
			</tbody>
		</table>
		<?php if (!defined('ELEMENTOR_PRO_VERSION') && has_header_footer()) : ?>
			<div class="notice notice-info inline"><p><?php echo esc_html(t('hfNotice')); ?></p></div>
		<?php endif; ?>
		<p>
			<button type="button" id="esg-run" class="button button-primary button-hero"><?php echo esc_html($done ? t('rerun') : t('run')); ?></button>
		</p>
		<?php if ($done) : ?>
			<p class="description"><?php echo esc_html(t('lastRun', array('date' => wp_date(get_option('date_format') . ' ' . get_option('time_format'), $state['done_at'])))); ?> <?php echo esc_html(t('rerunNote')); ?></p>
			<?php render_links(created_links($state)); ?>
		<?php endif; ?>
		<ol id="esg-log"></ol>
		<div id="esg-links"></div>
	</div>
	<style>
		#esg-log li.esg-error { color: #b32d2e; font-weight: 600; }
		#esg-log li.esg-warning { color: #996800; }
		#esg-log li.esg-success { color: #007017; font-weight: 600; }
		#esg-popup { position: fixed; inset: 0; z-index: 100000; display: flex; align-items: center; justify-content: center; padding: 16px; background: rgba(0,0,0,.55); }
		#esg-popup .esg-box { max-width: 520px; width: 100%; padding: 28px 30px; border-radius: 10px; background: #fff; box-shadow: 0 20px 60px rgba(0,0,0,.3); }
		#esg-popup h2 { margin: 0 0 12px; font-size: 22px; }
		#esg-popup p { font-size: 14px; line-height: 1.6; }
		#esg-popup .esg-actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 20px; }
	</style>
	<script>
	(function () {
		var cfg = <?php echo wp_json_encode($config); ?>;
		var button = document.getElementById('esg-run');
		var log = document.getElementById('esg-log');
		var fmt = function (text, vars) {
			return text.replace(/\{(\w+)\}/g, function (m, k) { return vars && k in vars ? vars[k] : m; });
		};
		var line = function (text, level) {
			var li = document.createElement('li');
			li.textContent = text;
			if (level) li.className = 'esg-' + level;
			log.appendChild(li);
			return li;
		};
		var step = function (name) {
			var body = new FormData();
			body.append('action', cfg.action);
			body.append('_ajax_nonce', cfg.nonce);
			body.append('step', name);
			return fetch(cfg.ajaxUrl, { method: 'POST', body: body, credentials: 'same-origin' }).then(function (res) {
				return res.json().catch(function () {
					throw new Error(res.status + ' ' + res.statusText);
				});
			}).then(function (json) {
				if (!json.success) throw new Error((json.data && json.data.message) || 'Unknown error');
				return json.data;
			});
		};
		var images = function (lineEl, lastDone) {
			return step('images').then(function (r) {
				lineEl.textContent = fmt(cfg.ui.importingImages, { done: r.progress[0], total: r.progress[1] });
				if (r.done) return;
				if (r.progress[0] <= lastDone) throw new Error(cfg.ui.stuck);
				return images(lineEl, r.progress[0]);
			});
		};
		var wait = function (ms) {
			return new Promise(function (resolve) { setTimeout(resolve, ms); });
		};
		var until = function (test, timeout) {
			var start = Date.now();
			return new Promise(function (resolve, reject) {
				(function tick() {
					var ok = false;
					try { ok = test(); } catch (e) { ok = false; }
					if (ok) return resolve();
					if (Date.now() - start > timeout) return reject(new Error('timeout'));
					setTimeout(tick, 500);
				})();
			});
		};
		/**
		 * One page or article opened in its WordPress editor (off screen): Yoast SEO analyzes it there (at
		 * least 5 seconds, then until its score is set), then it is saved like a click on "Update", which
		 * stores the scores (the green bullets of the lists of pages and articles).
		 */
		var openAndSave = function (item) {
			return new Promise(function (resolve, reject) {
				var frame = document.createElement('iframe');
				frame.setAttribute('aria-hidden', 'true');
				frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:1280px;height:900px;border:0';
				var finish = function (err) {
					clearTimeout(timer);
					frame.remove();
					if (err) reject(err); else resolve();
				};
				var timer = setTimeout(function () { finish(new Error('timeout')); }, 120000);
				var opened = false;
				frame.addEventListener('load', function () {
					if (opened) return;
					opened = true;
					var win = frame.contentWindow;
					var doc = win.document;
					var scored = function () {
						var el = doc.getElementById('yoast_wpseo_linkdex');
						return el && Number(el.value) > 0;
					};
					wait(5000).then(function () {
						return until(scored, 30000).catch(function () {});
					}).then(function () {
						var data = win.wp && win.wp.data;
						if (data && doc.body.classList.contains('block-editor-page') && data.dispatch('core/editor')) {
							var editor = data.select('core/editor');
							return Promise.resolve(data.dispatch('core/editor').savePost()).then(function () {
								return wait(1000);
							}).then(function () {
								return until(function () {
									var boxes = data.select('core/edit-post');
									return !editor.isSavingPost() && !(boxes && boxes.isSavingMetaBoxes && boxes.isSavingMetaBoxes());
								}, 45000);
							});
						}
						// Classic editor: the form is sent by its "Update" button, the editor loads again when it is saved
						var update = doc.getElementById('publish');
						if (!update) throw new Error('editor not found');
						return new Promise(function (saved) {
							frame.addEventListener('load', function () { saved(); });
							update.click();
						});
					}).then(function () { finish(); }, finish);
				});
				frame.src = item.url;
				document.body.appendChild(frame);
			});
		};
		var seoPass = function (items) {
			if (!items || !items.length) return Promise.resolve();
			var status = line('');
			var failed = 0;
			var next = function (i) {
				if (i >= items.length) {
					status.textContent = fmt(cfg.ui.seoPassDone, { n: items.length - failed, total: items.length });
					status.className = failed ? 'esg-warning' : 'esg-success';
					return Promise.resolve();
				}
				status.textContent = fmt(cfg.ui.seoPass, { done: i + 1, total: items.length, title: items[i].title });
				return openAndSave(items[i]).catch(function () {
					failed++;
					line(fmt(cfg.ui.seoPassFailed, { title: items[i].title }), 'warning');
				}).then(function () { return next(i + 1); });
			};
			return next(0);
		};
		var run = function () {
			button.disabled = true;
			log.innerHTML = '';
			document.getElementById('esg-links').innerHTML = '';
			var status = line(cfg.ui.running);
			line(cfg.ui.setup);
			// Plugins / theme installed in the "setup" request are loaded by the following requests
			step('setup').then(function (r) {
				r.messages.forEach(function (m) { line(m.text, m.level); });
				return step('extras');
			}).then(function (r) {
				r.messages.forEach(function (m) { line(m.text, m.level); });
				return images(line(''), -1);
			}).then(function () {
				line(cfg.ui.creatingContent);
				return step('content');
			}).then(function (r) {
				r.messages.forEach(function (m) { line(m.text, m.level); });
				status.textContent = cfg.ui.done;
				status.className = 'esg-success';
				document.getElementById('esg-links').innerHTML = r.linksHtml;
				button.textContent = cfg.ui.rerun;
				// Yoast SEO computes its scores in the editor: every page and article is opened and saved there
				return seoPass(r.seo);
			}).then(function () {
				// The site does not need this plugin any more: it removes itself (or asks to be removed)
				var cleaning = line(cfg.ui.cleaning);
				return step('cleanup').catch(function () {
					return { status: 'manual', message: cfg.ui.removeManual };
				}).then(function (c) {
					cleaning.textContent = c.message;
					cleaning.className = c.status === 'removed' ? 'esg-success' : 'esg-warning';
					if (c.status === 'removed' || c.status === 'deactivated') button.style.display = 'none';
					popup(c);
				});
			}).catch(function (e) {
				line(fmt(cfg.ui.failed, { message: e.message }), 'error');
			}).then(function () {
				button.disabled = false;
			});
		};
		// Popup at the end: the site is ready, and what happened to this plugin
		var popup = function (c) {
			var box = document.createElement('div');
			box.id = 'esg-popup';
			var inner = document.createElement('div');
			inner.className = 'esg-box';
			var h = document.createElement('h2');
			h.textContent = cfg.ui.popupTitle;
			var p = document.createElement('p');
			p.textContent = c.message;
			var actions = document.createElement('div');
			actions.className = 'esg-actions';
			var link = function (text, url, primary) {
				var a = document.createElement('a');
				a.className = 'button' + (primary ? ' button-primary button-hero' : ' button-hero');
				a.href = url;
				a.textContent = text;
				actions.appendChild(a);
			};
			if (c.status === 'deactivated' || c.status === 'manual') link(cfg.ui.goPlugins, cfg.urls.plugins, true);
			link(cfg.ui.viewSite, cfg.urls.home, c.status === 'removed' || c.status === 'keep');
			if (c.status === 'removed') link(cfg.ui.goDashboard, cfg.urls.dashboard, false);
			inner.appendChild(h);
			inner.appendChild(p);
			inner.appendChild(actions);
			box.appendChild(inner);
			// The plugin is still installed: the popup can be closed to read the log
			if (c.status !== 'removed') box.addEventListener('click', function (e) { if (e.target === box) box.remove(); });
			document.body.appendChild(box);
		};
		button.addEventListener('click', run);
		if (cfg.autorun) run();
	})();
	</script>
	<?php
}

function created_links(array $state) {
	$links = array();
	$home = (int) get_option('page_on_front');
	if ($home) {
		$links[] = array(t('viewSite'), home_url('/'));
	}
	foreach (array_merge($state['pages'], $state['posts']) as $id) {
		if (get_post($id)) {
			$links[] = array(get_the_title($id), get_permalink($id), get_edit_post_link($id, 'raw'));
		}
	}
	return $links;
}

/**
 * Pages and articles whose Yoast SEO scores must be computed: Yoast analyzes a text only in its editor,
 * so the page of this plugin opens each one there and saves it (openAndSave). Nothing without Yoast SEO.
 */
function seo_pass_items(array $state) {
	if (!defined('WPSEO_VERSION')) {
		return array();
	}
	$items = array();
	foreach (array_merge($state['pages'], $state['posts']) as $id) {
		$url = get_post($id) ? get_edit_post_link($id, 'raw') : '';
		if ($url) {
			$items[] = array('id' => (int) $id, 'title' => get_the_title($id), 'url' => $url);
		}
	}
	return $items;
}

function render_links(array $links) {
	if (!$links) {
		return;
	}
	echo '<ul class="ul-disc">';
	foreach ($links as $link) {
		echo '<li><a href="' . esc_url($link[1]) . '" target="_blank" rel="noopener">' . esc_html($link[0]) . '</a>';
		if (!empty($link[2])) {
			echo ' · <a href="' . esc_url($link[2]) . '">' . esc_html(t('edit')) . '</a>';
		}
		echo '</li>';
	}
	echo '</ul>';
}

function ajax_step() {
	check_ajax_referer(PAGE);
	if (!current_user_can('manage_options')) {
		wp_send_json_error(array('message' => 'Permission denied.'), 403);
	}
	if (function_exists('set_time_limit')) {
		@set_time_limit(300); // phpcs:ignore WordPress.PHP.NoSilencedErrors
	}
	try {
		$step = isset($_POST['step']) ? sanitize_key(wp_unslash($_POST['step'])) : '';
		if ($step === 'setup') {
			wp_send_json_success(setup_dependencies());
		}
		if ($step === 'extras') {
			wp_send_json_success(setup_extras());
		}
		if ($step === 'images') {
			wp_send_json_success(import_images(IMAGES_PER_REQUEST));
		}
		if ($step === 'content') {
			$result = import_content();
			ob_start();
			render_links(created_links(state()));
			$result['linksHtml'] = ob_get_clean();
			$result['seo'] = seo_pass_items(state());
			wp_send_json_success($result);
		}
		if ($step === 'cleanup') {
			wp_send_json_success(remove_self());
		}
		wp_send_json_error(array('message' => 'Unknown step.'), 400);
	} catch (\Throwable $e) {
		wp_send_json_error(array('message' => $e->getMessage()), 500);
	}
}

// ---------------------------------------------------------------------------- plugins + theme

function has_header_footer() {
	return (bool) array_filter(data()['templates'], function ($tpl) {
		return in_array($tpl['role'], array('header', 'footer'), true);
	});
}

function load_upgrader() {
	require_once ABSPATH . 'wp-admin/includes/plugin.php';
	require_once ABSPATH . 'wp-admin/includes/file.php';
	require_once ABSPATH . 'wp-admin/includes/misc.php';
	require_once ABSPATH . 'wp-admin/includes/class-wp-upgrader.php';
}

function upgrader_error($result, $skin) {
	if (is_wp_error($result)) {
		return $result->get_error_message();
	}
	$errors = $skin->get_errors();
	return $errors->has_errors() ? $errors->get_error_message() : 'unknown error';
}

/**
 * The real main file of a plugin: the one given when it exists, else the PHP file with the plugin
 * header in its folder (a Template Kit only tells the folder: e.g. Royal Elementor Addons is
 * royal-elementor-addons/wpr-addons.php, not royal-elementor-addons.php).
 */
function plugin_main_file(array $plugin) {
	if (file_exists(WP_PLUGIN_DIR . '/' . $plugin['file'])) {
		return $plugin['file'];
	}
	$folder = strtok($plugin['file'], '/');
	$found = $folder ? array_keys(get_plugins('/' . $folder)) : array();
	return $found ? $folder . '/' . $found[0] : $plugin['file'];
}

/** Install (from wordpress.org, or from $plugin['source'], a zip bundled with this plugin) and activate a plugin. */
function ensure_plugin(array $plugin, array &$messages) {
	load_upgrader();
	if (is_plugin_active($plugin['file'])) {
		return true;
	}
	$folder = strtok($plugin['file'], '/');
	if (!file_exists(WP_PLUGIN_DIR . '/' . $plugin['file']) && !($folder && is_dir(WP_PLUGIN_DIR . '/' . $folder))) {
		if (!current_user_can('install_plugins')) {
			$messages[] = array('level' => 'warning', 'text' => t('installFailed', array('name' => $plugin['name'], 'error' => 'permission denied')));
			return false;
		}
		$skin = new \WP_Ajax_Upgrader_Skin();
		$package = !empty($plugin['source']) ? $plugin['source'] : 'https://downloads.wordpress.org/plugin/' . $plugin['slug'] . '.latest-stable.zip';
		$result = (new \Plugin_Upgrader($skin))->install($package);
		if (is_wp_error($result) || !$result) {
			$messages[] = array('level' => 'warning', 'text' => t('installFailed', array('name' => $plugin['name'], 'error' => upgrader_error($result, $skin))));
			return false;
		}
	}
	$plugin['file'] = plugin_main_file($plugin);
	if (is_plugin_active($plugin['file'])) {
		return true;
	}
	$activated = activate_plugin($plugin['file']);
	if (is_wp_error($activated)) {
		$messages[] = array('level' => 'warning', 'text' => t('installFailed', array('name' => $plugin['name'], 'error' => $activated->get_error_message())));
		return false;
	}
	$messages[] = array('level' => 'info', 'text' => t('pluginReady', array('name' => $plugin['name'])));
	return true;
}

/**
 * The site uses only the Hello Elementor theme (the templates are made for it): it is installed from
 * wordpress.org if needed and activated; the other themes are deleted afterwards (remove_other_themes).
 */
function ensure_theme(array &$messages) {
	if (get_template() === 'hello-elementor') {
		return;
	}
	if (!wp_get_theme('hello-elementor')->exists()) {
		if (!current_user_can('install_themes')) {
			$messages[] = array('level' => 'warning', 'text' => t('installFailed', array('name' => 'Hello Elementor', 'error' => 'permission denied')));
			return;
		}
		load_upgrader();
		$skin = new \WP_Ajax_Upgrader_Skin();
		$result = (new \Theme_Upgrader($skin))->install('https://downloads.wordpress.org/theme/hello-elementor.latest-stable.zip');
		if (is_wp_error($result) || !$result) {
			$messages[] = array('level' => 'warning', 'text' => t('installFailed', array('name' => 'Hello Elementor', 'error' => upgrader_error($result, $skin))));
			return;
		}
	}
	switch_theme('hello-elementor');
	$messages[] = array('level' => 'info', 'text' => t('themeSwitched'));
}

/**
 * Only Hello Elementor stays: the other installed themes are deleted (never the active one, nor its
 * parent). Skipped on multisite (themes are shared by the network) and when WordPress could only
 * delete files with FTP credentials.
 */
function remove_other_themes(array &$messages) {
	if (get_template() !== 'hello-elementor' || is_multisite() || !current_user_can('delete_themes')) {
		return;
	}
	require_once ABSPATH . 'wp-admin/includes/theme.php';
	require_once ABSPATH . 'wp-admin/includes/file.php';
	$others = array_diff(array_keys(wp_get_themes()), array(get_stylesheet(), get_template()));
	if (!$others) {
		return;
	}
	if (get_filesystem_method() !== 'direct') {
		$messages[] = array('level' => 'warning', 'text' => t('themeRemoveFailed', array('name' => implode(', ', $others), 'error' => 'FTP credentials required')));
		return;
	}
	$removed = array();
	foreach ($others as $stylesheet) {
		$name = wp_get_theme($stylesheet)->get('Name');
		$result = delete_theme($stylesheet);
		if ($result === true) {
			$removed[] = $name;
		} else {
			$messages[] = array('level' => 'warning', 'text' => t('themeRemoveFailed', array('name' => $name, 'error' => is_wp_error($result) ? $result->get_error_message() : 'unknown error')));
		}
	}
	if ($removed) {
		$messages[] = array('level' => 'info', 'text' => t('themesRemoved', array('names' => implode(', ', $removed))));
	}
}

/**
 * First step: the theme, Contact Form 7 and, without Elementor Pro, Ultimate Addons for Elementor
 * (its Header Footer Builder shows the header and footer of the site, also after this plugin is removed).
 */
function setup_dependencies() {
	$messages = array();
	// WordPress in the language of the site (the plugins installed afterwards get their translations too)
	set_language($messages);
	// The sample content of a new WordPress ("Hello world!", "Sample Page", draft privacy page) goes away first
	remove_default_content($messages);
	// Elementor first: every page, article and template of the site is an Elementor document
	ensure_plugin(ELEMENTOR, $messages);
	// No redirect to the Elementor welcome screen on the next admin page
	delete_transient('elementor_activation_redirect');
	ensure_theme($messages);
	if (!empty(data()['contactForm'])) {
		ensure_plugin(CF7, $messages);
	}
	ensure_plugin(YOAST, $messages);
	$data = data();
	// UAE: header and footer without Elementor Pro, and the Navigation Menu widget of the header (also with Pro)
	if ((!defined('ELEMENTOR_PRO_VERSION') && has_header_footer()) || !empty($data['uaeWidgets'])) {
		ensure_plugin(UAE, $messages);
	}
	// Free plugins needed by the widgets of the Template Kit the site is made with
	$required = isset($data['requiredPlugins']) && is_array($data['requiredPlugins']) ? $data['requiredPlugins'] : array();
	foreach ($required as $plugin) {
		if (!empty($plugin['slug']) && !empty($plugin['file']) && preg_match('/^[a-z0-9-]+$/i', $plugin['slug'])) {
			ensure_plugin($plugin, $messages);
		}
	}
	return array('done' => true, 'messages' => $messages);
}

/**
 * Hello Dolly, the sample plugin that comes with WordPress (hello.php, or hello-dolly/hello.php), is
 * deactivated and deleted: a site for a client keeps no sample plugin.
 */
function remove_hello_dolly(array &$messages) {
	if (is_multisite() || !current_user_can('delete_plugins')) {
		return;
	}
	load_upgrader();
	require_once ABSPATH . 'wp-admin/includes/file.php';
	$found = array();
	foreach (array_keys(get_plugins()) as $file) {
		if ($file === 'hello.php' || $file === 'hello-dolly/hello.php') {
			$found[] = $file;
		}
	}
	if (!$found) {
		return;
	}
	if (get_filesystem_method() !== 'direct') {
		$messages[] = array('level' => 'warning', 'text' => t('pluginRemoveFailed', array('name' => 'Hello Dolly', 'error' => 'FTP credentials required')));
		return;
	}
	deactivate_plugins($found, true);
	$result = delete_plugins($found);
	if ($result === true) {
		$messages[] = array('level' => 'info', 'text' => t('pluginRemoved', array('name' => 'Hello Dolly')));
	} else {
		$messages[] = array('level' => 'warning', 'text' => t('pluginRemoveFailed', array('name' => 'Hello Dolly', 'error' => is_wp_error($result) ? $result->get_error_message() : 'unknown error')));
	}
}

/**
 * Second step (its own request, so that a slow host does not time out): login protection, cache and
 * SSL, the premium plugins bundled with this plugin, and only Hello Elementor among the themes.
 */
function setup_extras() {
	$messages = array();
	$data = data();
	remove_hello_dolly($messages);
	foreach (SITE_PLUGINS as $plugin) {
		ensure_plugin($plugin, $messages);
	}
	// WhatsApp button: Joinchat with the number of the site (digits with the country code), shown on every page
	if (!empty($data['whatsapp']) && preg_match('/^\d{6,20}$/', $data['whatsapp']) && ensure_plugin(JOINCHAT, $messages)) {
		$joinchat = get_option('joinchat', array());
		$joinchat = is_array($joinchat) ? $joinchat : array();
		$joinchat['telephone'] = $data['whatsapp'];
		update_option('joinchat', $joinchat);
		$messages[] = array('level' => 'info', 'text' => t('whatsappReady', array('number' => $data['whatsapp'])));
	}
	// Premium plugins uploaded in the app (e.g. WP Fastest Cache Premium), after the free plugins they extend
	$bundled = isset($data['bundledPlugins']) && is_array($data['bundledPlugins']) ? $data['bundledPlugins'] : array();
	foreach ($bundled as $plugin) {
		if (!empty($plugin['zip']) && !empty($plugin['file']) && preg_match('/^[a-z0-9-]+\.zip$/', $plugin['zip']) && file_exists(__DIR__ . '/plugins/' . $plugin['zip'])) {
			ensure_plugin(array('slug' => '', 'file' => $plugin['file'], 'name' => $plugin['name'], 'source' => __DIR__ . '/plugins/' . $plugin['zip']), $messages);
		}
	}
	remove_other_themes($messages);
	update_translations();
	return array('done' => true, 'messages' => $messages);
}

/**
 * WordPress (admin and front end) in the language of the site, e.g. it_IT: the language pack is
 * downloaded from wordpress.org when missing. Plugins installed afterwards get their translations.
 */
function set_language(array &$messages) {
	$locale = isset(data()['site']['locale']) ? (string) data()['site']['locale'] : '';
	if ($locale === '' || !preg_match('/^[a-z]{2}_[A-Z]{2}$/', $locale) || get_option('WPLANG') === $locale) {
		return;
	}
	require_once ABSPATH . 'wp-admin/includes/translation-install.php';
	if (!in_array($locale, get_available_languages(), true)) {
		if (!current_user_can('install_languages') || !wp_can_install_language_pack() || !wp_download_language_pack($locale)) {
			$messages[] = array('level' => 'warning', 'text' => t('languageFailed', array('locale' => $locale)));
			return;
		}
	}
	update_option('WPLANG', $locale);
	$messages[] = array('level' => 'info', 'text' => t('languageSet', array('locale' => $locale)));
}

/** Translations of the theme and of the plugins just installed, in the language of the site. */
function update_translations() {
	if (!get_option('WPLANG') || !current_user_can('update_plugins')) {
		return;
	}
	try {
		load_upgrader();
		require_once ABSPATH . 'wp-admin/includes/update.php';
		wp_update_plugins();
		wp_update_themes();
		$updates = wp_get_translation_updates();
		if ($updates) {
			(new \Language_Pack_Upgrader(new \Automatic_Upgrader_Skin()))->bulk_upgrade($updates);
		}
	} catch (\Throwable $e) {
		// Translations are a nicety: the site works without them
	}
}

/**
 * The sample content of a fresh WordPress: the "Hello world!" post (with its comment), the "Sample
 * Page" and the draft privacy policy page. Only the untouched ones (never edited) are deleted, and
 * only on the first run.
 */
function remove_default_content(array &$messages) {
	$state = state();
	if (!empty($state['done_at']) || !empty($state['defaults_removed'])) {
		return;
	}
	$slugs = array(
		'post' => array('hello-world', 'ciao-mondo', 'hola-mundo', 'bonjour-tout-le-monde', 'hallo-welt', 'ola-mundo'),
		'page' => array('sample-page', 'pagina-di-esempio', 'pagina-de-ejemplo', 'page-d-exemple', 'beispiel-seite', 'pagina-exemplo', 'privacy-policy'),
	);
	$removed = array();
	foreach ($slugs as $type => $names) {
		$posts = get_posts(array('post_type' => $type, 'post_status' => array('publish', 'draft'), 'post_name__in' => $names, 'numberposts' => 20));
		foreach ($posts as $post) {
			// Never edited since WordPress created it (the privacy page only while it is a draft)
			$untouched = $post->post_modified_gmt === $post->post_date_gmt || $post->post_modified_gmt === '0000-00-00 00:00:00';
			if (!$untouched || ($post->post_name === 'privacy-policy' && $post->post_status !== 'draft')) {
				continue;
			}
			if ((int) get_option('wp_page_for_privacy_policy') === (int) $post->ID) {
				update_option('wp_page_for_privacy_policy', 0);
			}
			$removed[] = $post->post_title;
			wp_delete_post($post->ID, true);
		}
	}
	$state['defaults_removed'] = 1;
	save_state($state);
	if ($removed) {
		$messages[] = array('level' => 'info', 'text' => t('defaultsRemoved', array('titles' => implode(', ', $removed))));
	}
}

/** The widgets of Ultimate Addons for Elementor are available (its Navigation Menu is the menu of the header). */
function uae_active() {
	require_once ABSPATH . 'wp-admin/includes/plugin.php';
	return is_plugin_active(UAE['file']);
}

/** Ultimate Addons for Elementor is active: header and footer are saved as its templates. */
function use_uae() {
	require_once ABSPATH . 'wp-admin/includes/plugin.php';
	return !defined('ELEMENTOR_PRO_VERSION') && is_plugin_active(UAE['file']) && post_type_exists('elementor-hf');
}

// ---------------------------------------------------------------------------- images

/** Copy up to $limit images into the Media Library. Unchanged images already imported are skipped. */
function import_images($limit) {
	$state = state();
	$total = count(data()['images']);
	$ready = 0;
	$imported = 0;
	foreach (data()['images'] as $img) {
		$known = isset($state['images'][$img['file']]) ? $state['images'][$img['file']] : null;
		if ($known && $known['hash'] === $img['hash'] && get_post($known['id'])) {
			$ready++;
			continue;
		}
		if ($imported >= $limit) {
			break;
		}
		$state['images'][$img['file']] = array('id' => import_image($img), 'hash' => $img['hash']);
		save_state($state);
		$imported++;
		$ready++;
	}
	return array('done' => $ready >= $total, 'progress' => array($ready, $total));
}

function import_image(array $img) {
	require_once ABSPATH . 'wp-admin/includes/image.php';
	$src = __DIR__ . '/images/' . $img['file'];
	if (!is_readable($src)) {
		throw new \RuntimeException('Missing image file: ' . $img['file']);
	}
	$upload = wp_upload_dir();
	if (!empty($upload['error'])) {
		throw new \RuntimeException($upload['error']);
	}
	wp_mkdir_p($upload['path']);
	// Copied directly (not through the upload checks) so SVG logos are accepted too.
	$name = wp_unique_filename($upload['path'], $img['file']);
	$dest = trailingslashit($upload['path']) . $name;
	if (!copy($src, $dest)) {
		throw new \RuntimeException('Cannot write ' . $dest);
	}
	$id = wp_insert_attachment(
		array(
			'post_mime_type' => $img['mime'],
			'post_title' => $img['title'],
			'post_content' => '',
			'post_status' => 'inherit',
			'guid' => trailingslashit($upload['url']) . $name,
		),
		$dest,
		0,
		true
	);
	if (is_wp_error($id)) {
		throw new \RuntimeException($id->get_error_message());
	}
	if ($img['mime'] !== 'image/svg+xml') {
		wp_update_attachment_metadata($id, wp_generate_attachment_metadata($id, $dest));
	} else {
		// WordPress does not measure SVGs: without a size the logo (custom logo, image widgets) can show at 0 px
		$size = svg_size((string) file_get_contents($dest));
		$meta = array('file' => _wp_relative_upload_path($dest), 'sizes' => array());
		if ($size) {
			$meta['width'] = $size[0];
			$meta['height'] = $size[1];
		}
		wp_update_attachment_metadata($id, $meta);
	}
	if ($img['alt'] !== '') {
		update_post_meta($id, '_wp_attachment_image_alt', wp_slash($img['alt']));
	}
	return $id;
}

/** array(width, height) in px of an SVG (width / height of the root element, else its viewBox), or null. */
function svg_size($svg) {
	if (!preg_match('/<svg\b[^>]*>/i', $svg, $root)) {
		return null;
	}
	$attr = function ($name) use ($root) {
		return preg_match('/\s' . $name . '\s*=\s*["\']([^"\']*)["\']/i', $root[0], $m) ? $m[1] : '';
	};
	$px = function ($v) {
		if (!preg_match('/^\s*([\d.]+)\s*(px|pt|pc|mm|cm|in)?\s*$/i', $v, $m)) {
			return 0;
		}
		$units = array('px' => 1, 'pt' => 4 / 3, 'pc' => 16, 'mm' => 96 / 25.4, 'cm' => 96 / 2.54, 'in' => 96);
		return (int) round((float) $m[1] * $units[strtolower(isset($m[2]) && $m[2] !== '' ? $m[2] : 'px')]);
	};
	$w = $px($attr('width'));
	$h = $px($attr('height'));
	$box = preg_split('/[\s,]+/', trim($attr('viewBox')));
	if (count($box) === 4 && (float) $box[2] > 0 && (float) $box[3] > 0) {
		if (!$w && !$h) {
			$w = (int) round((float) $box[2]);
			$h = (int) round((float) $box[3]);
		} elseif (!$h) {
			$h = (int) round($w * (float) $box[3] / (float) $box[2]);
		} elseif (!$w) {
			$w = (int) round($h * (float) $box[2] / (float) $box[3]);
		}
	}
	return ($w > 0 && $h > 0) ? array($w, $h) : null;
}

/** file name => array(id, url) of the imported images. */
function image_map(array $state) {
	$map = array();
	foreach (data()['images'] as $img) {
		$id = isset($state['images'][$img['file']]) ? (int) $state['images'][$img['file']]['id'] : 0;
		$url = $id ? wp_get_attachment_url($id) : false;
		if ($url) {
			$map[$img['file']] = array('id' => $id, 'url' => $url);
		}
	}
	return $map;
}

// ---------------------------------------------------------------------------- Elementor data

/** Site-relative link ("/contatti/") -> absolute, so it also works when WordPress is in a subfolder. */
function absolute_url($url) {
	return (is_string($url) && strpos($url, '/') === 0 && strpos($url, '//') !== 0) ? home_url($url) : $url;
}

function replace_string($text, array $r) {
	if (strpos($text, SCHEME) !== false) {
		$text = preg_replace_callback(
			'#' . preg_quote(SCHEME, '#') . '([A-Za-z0-9._-]+)#',
			function ($m) use ($r) {
				return isset($r['images'][$m[1]]) ? $r['images'][$m[1]]['url'] : '';
			},
			$text
		);
	}
	if ($r['strings']) {
		$text = strtr($text, $r['strings']);
	}
	if (strpos($text, 'href=') !== false) {
		$text = preg_replace_callback(
			'#(href=["\'])(/(?!/)[^"\']*)#',
			function ($m) use ($r) {
				return in_array($m[2], $r['relative'], true) ? $m[0] : $m[1] . home_url($m[2]);
			},
			$text
		);
	}
	return $text;
}

/**
 * Walk Elementor data: bundled images ("esg-image://file") -> Media Library id + URL,
 * nav menus -> the site menu, internal links -> absolute URLs (except the relative links of the data),
 * contact form placeholder -> real form.
 */
function prepare_elementor($node, array $r) {
	if (is_string($node)) {
		return replace_string($node, $r);
	}
	if (!is_array($node)) {
		return $node;
	}
	if (isset($node['url']) && is_string($node['url']) && strpos($node['url'], SCHEME) === 0) {
		$file = substr($node['url'], strlen(SCHEME));
		$img = isset($r['images'][$file]) ? $r['images'][$file] : array('id' => '', 'url' => '');
		$node['url'] = $img['url'];
		$node['id'] = $img['id'];
	}
	if (isset($node['widgetType'], $node['settings']) && is_array($node['settings'])) {
		// The Elementor Pro menu of a Template Kit header needs Pro: without it, the free UAE menu widget
		if ($node['widgetType'] === 'nav-menu' && !empty($r['uae_menu'])) {
			$node['widgetType'] = 'navigation-menu';
			$node['settings'] = array_merge(
				array_filter($node['settings'], function ($key) {
					return strpos($key, '_') === 0;
				}, ARRAY_FILTER_USE_KEY),
				array('menu' => $r['menu'], 'layout' => 'horizontal', 'navmenu_align' => 'right')
			);
		}
		// The Elementor Pro form of a Template Kit needs Pro: without it, the contact form of the site in its place
		if ($node['widgetType'] === 'form' && !empty($r['form_fallback'])) {
			$node['widgetType'] = 'shortcode';
			$node['settings'] = array_merge(
				array_filter($node['settings'], function ($key) {
					return strpos($key, '_') === 0;
				}, ARRAY_FILTER_USE_KEY),
				array('shortcode' => $r['form_fallback'])
			);
		}
		if (preg_match('/nav-menu|mega-menu|navigation-menu/', $node['widgetType'])) {
			$node['settings']['menu'] = $r['menu'];
		}
		// Menu of a generated header (UAE Navigation Menu) when UAE could not be installed: the site menu in the
		// "WordPress Menu" widget of free Elementor instead, so the header still has its pages (without hamburger)
		if ($node['widgetType'] === 'navigation-menu' && empty($r['uae_widgets'])) {
			$node['widgetType'] = 'wp-widget-nav_menu';
			$node['settings'] = array_merge(
				array_filter($node['settings'], function ($key) {
					return strpos($key, '_') === 0;
				}, ARRAY_FILTER_USE_KEY),
				array('wp' => array('title' => ''))
			);
		}
		// "WordPress Menu" widget: the site menu (Appearance -> Menus); the id also selects it in the Elementor editor
		if ($node['widgetType'] === 'wp-widget-nav_menu') {
			$wp = isset($node['settings']['wp']) && is_array($node['settings']['wp']) ? $node['settings']['wp'] : array();
			$node['settings']['wp'] = array_merge($wp, array('nav_menu' => (string) $r['menu_id']));
		}
	}
	$is_link = isset($node['url']) && (array_key_exists('is_external', $node) || array_key_exists('nofollow', $node));
	foreach ($node as $key => $value) {
		$node[$key] = ($key === 'url' && $is_link) ? absolute_url($value) : prepare_elementor($value, $r);
	}
	return $node;
}

function set_elementor($post_id, array $doc, $template_type, array $r) {
	$content = prepare_elementor(isset($doc['content']) ? $doc['content'] : array(), $r);
	update_post_meta($post_id, '_elementor_edit_mode', 'builder');
	update_post_meta($post_id, '_elementor_template_type', $template_type);
	update_post_meta($post_id, '_elementor_version', defined('ELEMENTOR_VERSION') ? ELEMENTOR_VERSION : '3.0.0');
	update_post_meta($post_id, '_elementor_data', wp_slash(wp_json_encode($content)));
	if (!empty($doc['page_settings'])) {
		update_post_meta($post_id, '_elementor_page_settings', wp_slash(prepare_elementor($doc['page_settings'], $r)));
	}
	delete_post_meta($post_id, '_elementor_css');
	delete_post_meta($post_id, '_elementor_element_cache');
}

function clear_elementor($post_id) {
	foreach (array('_elementor_edit_mode', '_elementor_template_type', '_elementor_data', '_elementor_page_settings', '_elementor_css', '_elementor_element_cache') as $key) {
		delete_post_meta($post_id, $key);
	}
}

// ---------------------------------------------------------------------------- content

/**
 * Insert or update a post. Reuses the post created by a previous run, or an existing
 * post with the same slug (so the links of the site keep working).
 */
function upsert_post(array &$state, $bucket, $key, array $post) {
	$id = isset($state[$bucket][$key]) ? (int) $state[$bucket][$key] : 0;
	if ($id && !get_post($id)) {
		$id = 0;
	}
	if (!$id && $post['post_type'] !== 'elementor_library' && $post['post_name'] !== '') {
		$existing = get_page_by_path($post['post_name'], OBJECT, $post['post_type']);
		$id = $existing ? $existing->ID : 0;
	}
	if ($id) {
		$post['ID'] = $id;
	}
	$result = $id ? wp_update_post(wp_slash($post), true) : wp_insert_post(wp_slash($post), true);
	if (is_wp_error($result)) {
		throw new \RuntimeException($result->get_error_message());
	}
	$state[$bucket][$key] = (int) $result;
	save_state($state);
	return (int) $result;
}

/** SEO of a page / article for Yoast SEO (and Rank Math): focus keyphrase, SEO title, meta description. */
function set_seo($post_id, $seo) {
	if (!empty($seo['keyphrase'])) {
		update_post_meta($post_id, '_yoast_wpseo_focuskw', wp_slash($seo['keyphrase']));
		update_post_meta($post_id, 'rank_math_focus_keyword', wp_slash($seo['keyphrase']));
	}
	if (!empty($seo['title'])) {
		update_post_meta($post_id, '_yoast_wpseo_title', wp_slash($seo['title']));
		update_post_meta($post_id, 'rank_math_title', wp_slash($seo['title']));
	}
	if (!empty($seo['description'])) {
		update_post_meta($post_id, '_yoast_wpseo_metadesc', wp_slash($seo['description']));
		update_post_meta($post_id, 'rank_math_description', wp_slash($seo['description']));
	}
	// SEO score of the page computed with the checks of Yoast SEO on its final text (0-100, green from 71):
	// shown in the lists of pages / articles; Yoast computes it again when the page is opened in the editor
	if (isset($seo['score']) && is_numeric($seo['score'])) {
		update_post_meta($post_id, '_yoast_wpseo_linkdex', (string) max(0, min(100, (int) $seo['score'])));
	}
}

/**
 * Like opening the page in Elementor and clicking "Update": Elementor saves the document, writing the
 * text of the page into the post content and saving the post again, so Yoast SEO analyses (and
 * indexes) the real text, headings, images and links of the page instead of an empty content.
 */
function save_like_editor($post_id) {
	if (!class_exists('\Elementor\Plugin') || empty(\Elementor\Plugin::$instance->documents)) {
		return;
	}
	try {
		$document = \Elementor\Plugin::$instance->documents->get($post_id, false);
		if ($document) {
			$document->save(array('elements' => $document->get_elements_data()));
		}
	} catch (\Throwable $e) {
		// The page stays as imported: it is updated when opened in Elementor
	}
}

/** Yoast SEO site representation: the business as an organization, with its name and logo (structured data). */
function yoast_site_settings(array $data, array $images, array &$messages) {
	if (!defined('WPSEO_VERSION')) {
		return;
	}
	$titles = get_option('wpseo_titles', array());
	$titles = is_array($titles) ? $titles : array();
	$titles['company_or_person'] = 'company';
	$titles['company_name'] = $data['site']['name'];
	if (!empty($data['logo']) && isset($images[$data['logo']])) {
		$titles['company_logo'] = $images[$data['logo']]['url'];
		$titles['company_logo_id'] = $images[$data['logo']]['id'];
	}
	update_option('wpseo_titles', $titles);
	// Social profiles of the business (organization schema): Facebook + the others
	$socials = isset($data['socials']) && is_array($data['socials']) ? $data['socials'] : array();
	if ($socials) {
		$social = get_option('wpseo_social', array());
		$social = is_array($social) ? $social : array();
		$others = array();
		foreach ($socials as $s) {
			if ($s['key'] === 'facebook_url') {
				$social['facebook_site'] = esc_url_raw($s['url']);
			} else {
				$others[] = esc_url_raw($s['url']);
			}
		}
		$social['other_social_urls'] = $others;
		update_option('wpseo_social', $social);
	}
	$messages[] = array('level' => 'info', 'text' => t('yoastReady'));
}

function category_id(array $category) {
	$term = term_exists($category['slug'], 'category');
	if (!$term) {
		$term = wp_insert_term($category['name'], 'category', array('slug' => $category['slug']));
	}
	if (is_wp_error($term)) {
		throw new \RuntimeException($term->get_error_message());
	}
	return (int) (is_array($term) ? $term['term_id'] : $term);
}

/**
 * The contact form (created once with Contact Form 7, mail sent to the site email) and its
 * shortcode; null when the form plugin is not active.
 */
function contact_form(array &$state, array &$messages) {
	$cf = data()['contactForm'];
	if (!$cf) {
		return null;
	}
	if (!$state['form'] && !empty($state['cf7'])) {
		$state['form'] = array('plugin' => 'cf7', 'id' => (int) $state['cf7']); // created by an earlier version of the plugin
	}
	// A MetForm form made by an earlier version is replaced by a Contact Form 7 one
	$known = (is_array($state['form']) && $state['form']['plugin'] === 'cf7') ? (int) $state['form']['id'] : 0;
	if (!class_exists('WPCF7_ContactForm')) {
		$messages[] = array('level' => 'warning', 'text' => t('noForm', array('plugin' => $cf['name'])));
		return null;
	}
	$form = $known ? \WPCF7_ContactForm::get_instance($known) : null;
	if (!$form) {
		$form = \WPCF7_ContactForm::get_template(array('title' => $cf['title']));
		$props = $form->get_properties();
		// Fields of the site (name, email, phone, message, privacy consent) and the email to the site owner
		$props['form'] = $cf['form'];
		$props['mail']['recipient'] = $cf['recipient'];
		$props['mail']['subject'] = $cf['subject'];
		$props['mail']['body'] = $cf['body'];
		$props['mail']['additional_headers'] = $cf['replyTo'];
		$props['messages']['mail_sent_ok'] = $cf['success'];
		$form->set_properties($props);
		$form->save();
		$state['form'] = array('plugin' => 'cf7', 'id' => (int) $form->id());
		save_state($state);
		$messages[] = array('level' => 'info', 'text' => t('formCreated', array('title' => $cf['title'], 'plugin' => $cf['name'], 'email' => $cf['recipient'])));
	}
	return method_exists($form, 'shortcode') ? $form->shortcode() : sprintf('[contact-form-7 id="%d" title="%s"]', $form->id(), esc_attr($form->title()));
}

function site_menu(array $menu) {
	$existing = wp_get_nav_menu_object($menu['name']);
	$id = $existing ? $existing->term_id : wp_create_nav_menu($menu['name']);
	if (is_wp_error($id)) {
		throw new \RuntimeException($id->get_error_message());
	}
	return wp_get_nav_menu_object($id);
}

/** Menu items for the site pages (only the items added by this plugin are replaced). */
function fill_menu(array &$state, $menu, array $page_ids) {
	foreach ($state['menu_items'] as $item_id) {
		if (get_post($item_id)) {
			wp_delete_post($item_id, true);
		}
	}
	$state['menu_items'] = array();
	foreach ($page_ids as $position => $page_id) {
		$item = wp_update_nav_menu_item($menu->term_id, 0, array(
			'menu-item-object-id' => $page_id,
			'menu-item-object' => 'page',
			'menu-item-type' => 'post_type',
			'menu-item-status' => 'publish',
			'menu-item-title' => get_the_title($page_id),
			'menu-item-position' => $position + 1,
		));
		if (!is_wp_error($item)) {
			$state['menu_items'][] = (int) $item;
		}
	}
	save_state($state);
	// Theme menu location (used when the theme header is shown instead of an Elementor one)
	$locations = get_theme_mod('nav_menu_locations', array());
	if (!in_array($menu->term_id, (array) $locations, true)) {
		foreach (array_keys(get_registered_nav_menus()) as $location) {
			if (empty($locations[$location])) {
				$locations[$location] = $menu->term_id;
				set_theme_mod('nav_menu_locations', $locations);
				break;
			}
		}
	}
}

function gallery_shortcode(array $images) {
	$ids = array();
	foreach (data()['images'] as $img) {
		if (!empty($img['photo']) && isset($images[$img['file']])) {
			$ids[] = $images[$img['file']]['id'];
		}
	}
	return $ids ? '[gallery ids="' . implode(',', $ids) . '" link="file" size="large" columns="3"]' : '';
}

function import_content() {
	if (!defined('ELEMENTOR_VERSION')) {
		throw new \RuntimeException(t('noElementor'));
	}
	$data = data();
	$state = state();
	$messages = array();
	$images = image_map($state);
	$category = category_id($data['category']);
	$menu = site_menu($data['menu']);
	$shortcode = contact_form($state, $messages);
	$r = array(
		'images' => $images,
		'menu' => $menu->slug,
		'menu_id' => (int) $menu->term_id,
		'uae_menu' => use_uae(),
		'uae_widgets' => uae_active(),
		'relative' => isset($data['relativeLinks']) ? (array) $data['relativeLinks'] : array(),
		'form_fallback' => (!defined('ELEMENTOR_PRO_VERSION') && $shortcode) ? $shortcode : '',
		'strings' => ($shortcode && !empty($data['contactForm']['placeholder'])) ? array($data['contactForm']['placeholder'] => $shortcode) : array(),
	);

	// Pages: Home, About, Services, Gallery, Contact
	$page_ids = array();
	foreach ($data['pages'] as $order => $page) {
		$doc = element_doc($page['elementor']);
		$content = (!$doc && $page['role'] === 'gallery') ? gallery_shortcode($images) : '';
		$id = upsert_post($state, 'pages', $page['key'], array(
			'post_type' => 'page',
			'post_status' => 'publish',
			'post_title' => $page['title'],
			'post_name' => $page['slug'],
			'post_content' => $content,
			'menu_order' => $order,
		));
		if ($doc) {
			update_post_meta($id, '_wp_page_template', 'elementor_header_footer');
			set_elementor($id, $doc, 'wp-page', $r);
		} else {
			clear_elementor($id);
			$messages[] = array('level' => 'warning', 'text' => t('noTemplate', array('title' => $page['title'])));
		}
		set_seo($id, $page['seo']);
		if ($doc) {
			save_like_editor($id);
		}
		$page_ids[$page['role']] = $id;
	}

	// Services: one article each, in the services category, with featured image. Each article is
	// built with Elementor in the design of the single post template (hero with the featured image,
	// content, sidebar with the other services), so it needs no Elementor Pro. Comments are closed.
	update_option('default_comment_status', 'closed');
	update_option('default_ping_status', 'closed');
	foreach ($data['posts'] as $post) {
		$image = ($post['image'] && isset($images[$post['image']])) ? $images[$post['image']]['id'] : 0;
		$content = replace_string($post['content'], $r);
		$post_doc = !empty($post['elementor']) ? element_doc($post['elementor']) : null;
		if ($image && !$post_doc && !defined('ELEMENTOR_PRO_VERSION')) {
			$content = '<figure class="wp-block-image size-large">' . wp_get_attachment_image($image, 'large') . '</figure>' . "\n" . $content;
		}
		$id = upsert_post($state, 'posts', $post['key'], array(
			'post_type' => 'post',
			'post_status' => 'publish',
			'post_title' => $post['title'],
			'post_name' => $post['slug'],
			'post_content' => $content,
			'post_excerpt' => $post['excerpt'],
			'post_category' => array($category),
			'comment_status' => 'closed',
			'ping_status' => 'closed',
		));
		if ($image) {
			set_post_thumbnail($id, $image);
		}
		if ($post_doc) {
			update_post_meta($id, '_wp_page_template', 'elementor_header_footer');
			set_elementor($id, $post_doc, 'wp-post', $r);
		} else {
			clear_elementor($id);
		}
		set_seo($id, $post['seo']);
		if ($post_doc) {
			save_like_editor($id);
		}
	}

	fill_menu($state, $menu, array_values($page_ids));

	// Header, footer and single post: Elementor Pro theme templates. Without Pro the theme document
	// types do not exist: the templates are saved as sections and this plugin displays header and footer.
	// The single post template is saved without display condition: the service articles are already
	// built with its design (it can be assigned by hand to articles written later).
	$pro = defined('ELEMENTOR_PRO_VERSION');
	$uae = use_uae();
	$hf = array();
	foreach ($data['templates'] as $tpl) {
		$doc = element_doc($tpl['elementor']);
		if (!$doc) {
			continue;
		}
		// Without Pro: header and footer are Ultimate Addons for Elementor templates shown on the whole
		// site, so they do not depend on this plugin
		if ($uae && in_array($tpl['role'], array('header', 'footer'), true)) {
			$id = upsert_post($state, 'uae', $tpl['key'], array(
				'post_type' => 'elementor-hf',
				'post_status' => 'publish',
				'post_title' => $tpl['title'],
				'post_name' => sanitize_title($data['site']['name'] . ' ' . $tpl['title']),
			));
			set_elementor($id, $doc, 'wp-post', $r);
			update_post_meta($id, 'ehf_template_type', $tpl['role'] === 'header' ? 'type_header' : 'type_footer');
			update_post_meta($id, 'ehf_target_include_locations', array('rule' => array('basic-global'), 'specific' => array()));
			update_post_meta($id, 'ehf_target_exclude_locations', array());
			update_post_meta($id, 'ehf_target_user_roles', array('all'));
			continue;
		}
		$type = $pro ? $tpl['type'] : 'section';
		$id = upsert_post($state, 'templates', $tpl['key'], array(
			'post_type' => 'elementor_library',
			'post_status' => 'publish',
			'post_title' => $tpl['title'],
			'post_name' => sanitize_title($data['site']['name'] . ' ' . $tpl['title']),
		));
		set_elementor($id, $doc, $type, $r);
		wp_set_object_terms($id, $type, 'elementor_library_type');
		if ($pro) {
			if ($tpl['role'] !== 'single_post') {
				update_post_meta($id, '_elementor_conditions', array('include/general'));
			} else {
				delete_post_meta($id, '_elementor_conditions');
			}
		} elseif (in_array($tpl['role'], array('header', 'footer'), true)) {
			$hf[$tpl['role']] = $id;
		}
	}
	if ($pro) {
		delete_option(OPTION_HF);
		if ($data['templates']) {
			regenerate_theme_conditions($messages);
		}
	} elseif ($uae) {
		delete_option(OPTION_HF); // UAE shows them: this plugin must not print them a second time
		if (has_header_footer()) {
			$messages[] = array('level' => 'info', 'text' => t('uaeReady'));
		}
	} elseif ($hf) {
		// UAE could not be installed: this plugin shows header and footer, so the site still has them
		update_option(OPTION_HF, $hf, true);
		$messages[] = array('level' => 'warning', 'text' => t('uaeMissing'));
		if (get_template() !== 'hello-elementor') {
			$messages[] = array('level' => 'warning', 'text' => t('hfTheme'));
		}
	}

	apply_global_styles($data['globalStyles'], $messages);
	apply_site_css(isset($data['siteCss']) ? $data['siteCss'] : '');

	// Site settings: name, logo, static front page, "Post name" permalinks
	update_option('blogname', $data['site']['name']);
	// Tagline: the main service and the place, e.g. "Idraulico a Roma"
	if (!empty($data['site']['tagline'])) {
		update_option('blogdescription', $data['site']['tagline']);
	}
	if (!empty($data['logo']) && isset($images[$data['logo']])) {
		set_theme_mod('custom_logo', $images[$data['logo']]['id']);
		// Site icon (favicon): the square PNG made from the logo (also for an SVG logo), else the logo itself when it is a bitmap
		$icon = (!empty($data['siteIcon']) && isset($images[$data['siteIcon']])) ? $data['siteIcon'] : (preg_match('/\.svg$/i', $data['logo']) ? '' : $data['logo']);
		if ($icon !== '') {
			update_option('site_icon', $images[$icon]['id']);
			$messages[] = array('level' => 'info', 'text' => t('faviconSet'));
		}
	}
	yoast_site_settings($data, $images, $messages);
	if (isset($page_ids['home'])) {
		update_option('show_on_front', 'page');
		update_option('page_on_front', $page_ids['home']);
	}
	// The links of the site (e.g. /service-name/ for the articles) need "Post name" permalinks
	if (get_option('permalink_structure') !== '/%postname%/') {
		global $wp_rewrite;
		$wp_rewrite->set_permalink_structure('/%postname%/');
		$messages[] = array('level' => 'info', 'text' => t('permalinks'));
	}
	flush_rewrite_rules(false);
	if (class_exists('\Elementor\Plugin') && isset(\Elementor\Plugin::$instance->files_manager)) {
		\Elementor\Plugin::$instance->files_manager->clear_cache();
	}

	$state['done_at'] = time();
	save_state($state);
	$messages[] = array('level' => 'info', 'text' => t('summary', array('pages' => count($page_ids), 'posts' => count($data['posts']), 'images' => count($images))));
	return array('done' => true, 'messages' => $messages);
}

/**
 * Last step: the site no longer needs this plugin (header and footer are UAE / Elementor Pro
 * templates, the articles are static Elementor documents), so it deactivates and deletes itself.
 * When WordPress can only delete files with FTP credentials it is just deactivated, and the popup
 * asks to delete it. It stays active when it displays the header and footer itself (no UAE, no Pro).
 * @return array { status: removed | deactivated | manual | keep, message }
 */
function remove_self() {
	if (get_option(OPTION_HF)) {
		return array('status' => 'keep', 'message' => t('keepPlugin'));
	}
	require_once ABSPATH . 'wp-admin/includes/plugin.php';
	require_once ABSPATH . 'wp-admin/includes/file.php';
	$basename = plugin_basename(__FILE__);
	if (!current_user_can('activate_plugins')) {
		return array('status' => 'manual', 'message' => t('removeManual'));
	}
	deactivate_plugins($basename, true);
	if (is_plugin_active($basename)) {
		return array('status' => 'manual', 'message' => t('removeManual'));
	}
	if (current_user_can('delete_plugins') && get_filesystem_method() === 'direct' && delete_plugins(array($basename)) === true) {
		return array('status' => 'removed', 'message' => t('removed'));
	}
	return array('status' => 'deactivated', 'message' => t('deactivated'));
}

// ---------------------------------------------------------------------------- comments

/** Comments and pings are closed on articles and pages. */
function no_comments($open, $post_id) {
	return in_array(get_post_type($post_id), array('post', 'page'), true) ? false : $open;
}

/** Comments already saved are not shown on articles and pages. */
function no_comment_list($comments, $post_id) {
	return in_array(get_post_type($post_id), array('post', 'page'), true) ? array() : $comments;
}

/** No comment box in the article editor. */
function remove_comment_support() {
	remove_post_type_support('post', 'comments');
	remove_post_type_support('post', 'trackbacks');
}

// ---------------------------------------------------------------------------- header + footer without Elementor Pro

/** Header / footer template ids to display (only on the front end, only without Elementor Pro). */
function header_footer() {
	if (is_admin() || defined('ELEMENTOR_PRO_VERSION') || !did_action('elementor/loaded') || (did_action('wp') && is_singular('elementor_library'))) {
		return array();
	}
	$ids = get_option(OPTION_HF, array());
	return is_array($ids) ? array_filter(array_map('intval', $ids)) : array();
}

/** Hello Elementor: hide the theme header/footer when the site ones are displayed. */
function theme_header_footer($show) {
	return header_footer() ? false : $show;
}

function render_part($role) {
	static $printed = array();
	$ids = header_footer();
	if (empty($ids[$role]) || isset($printed[$role]) || get_post_status($ids[$role]) !== 'publish') {
		return;
	}
	$printed[$role] = true;
	echo \Elementor\Plugin::instance()->frontend->get_builder_content_for_display($ids[$role], true); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- Elementor markup
}

function render_header() {
	render_part('header');
}

function render_footer() {
	render_part('footer');
}

/** Styles of the header/footer, also on pages not built with Elementor (e.g. the service articles). */
function enqueue_header_footer() {
	$ids = header_footer();
	if (!$ids) {
		return;
	}
	\Elementor\Plugin::instance()->frontend->enqueue_styles();
	if (class_exists('\Elementor\Core\Files\CSS\Post')) {
		foreach ($ids as $id) {
			\Elementor\Core\Files\CSS\Post::create($id)->enqueue();
		}
	}
}

/** Elementor Pro caches the display conditions of theme templates: rebuild that cache. */
function regenerate_theme_conditions(array &$messages) {
	try {
		if (class_exists('\ElementorPro\Modules\ThemeBuilder\Module')) {
			$manager = \ElementorPro\Modules\ThemeBuilder\Module::instance()->get_conditions_manager();
			if (method_exists($manager, 'get_cache')) {
				$manager->get_cache()->regenerate();
				return;
			}
		}
	} catch (\Throwable $e) {
		// reported below
	}
	$messages[] = array('level' => 'warning', 'text' => t('conditions'));
}

/**
 * CSS of the whole site (header layout, finishing touches of the template) -> Appearance -> Customize ->
 * Additional CSS of the active theme, between markers: running again replaces it, the CSS the site
 * owner adds there stays. It keeps working after this plugin is deleted.
 */
function apply_site_css($css) {
	if (!is_string($css) || trim($css) === '' || !function_exists('wp_update_custom_css_post')) {
		return;
	}
	$start = '/* ' . PAGE . ':start */';
	$end = '/* ' . PAGE . ':end */';
	$pattern = '#\s*' . preg_quote($start, '#') . '.*?' . preg_quote($end, '#') . '\s*#s';
	$own = trim(preg_replace($pattern, "\n", wp_get_custom_css()));
	$block = $start . "\n" . trim($css) . "\n" . $end;
	wp_update_custom_css_post($own === '' ? $block : $own . "\n\n" . $block);
}

/** Colors and fonts of the template -> the global colors / fonts of the active Elementor kit. */
function apply_global_styles($styles, array &$messages) {
	$kit_id = (int) get_option('elementor_active_kit');
	if (!$styles || !$kit_id || !get_post($kit_id)) {
		return;
	}
	$current = get_post_meta($kit_id, '_elementor_page_settings', true);
	$current = is_array($current) ? $current : array();
	// The custom colors of the site (titles, dark, light background) are added to the ones the kit already has
	if (!empty($styles['custom_colors']) && !empty($current['custom_colors']) && is_array($current['custom_colors'])) {
		$ours = wp_list_pluck($styles['custom_colors'], '_id');
		$kept = array_filter($current['custom_colors'], function ($c) use ($ours) {
			return !in_array(isset($c['_id']) ? $c['_id'] : '', $ours, true);
		});
		$styles['custom_colors'] = array_merge($styles['custom_colors'], array_values($kept));
	}
	update_post_meta($kit_id, '_elementor_page_settings', wp_slash(array_merge($current, $styles)));
	delete_post_meta($kit_id, '_elementor_css');
	$messages[] = array('level' => 'info', 'text' => t('globalStyles'));
}
