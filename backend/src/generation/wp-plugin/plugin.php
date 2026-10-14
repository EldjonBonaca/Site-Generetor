<?php
/**
 * Plugin Name: {{PLUGIN_NAME}}
 * Description: {{PLUGIN_DESCRIPTION}}
 * Version: {{VERSION}}
 * Requires at least: 6.2
 * Requires PHP: 7.4
 * Requires Plugins: elementor
 * Author: Elementor Site Generator
 * License: GPL-2.0-or-later
 *
 * Generated file. On activation it opens Tools → {{MENU_TITLE}}, which creates the website:
 *  1. setup: Hello Elementor theme (replacing a block theme, or any theme without Elementor Pro) and
 *     the contact form plugin (MetForm or Contact Form 7); no other addon (no UAE);
 *  2. images (Media Library), a few per request;
 *  3. the 5 pages (Home, About, Services, Gallery, Contact) built with Elementor, one article per
 *     service, the menu, the contact form, header/footer/single post templates and the template colors.
 * Header and footer: Elementor Pro Theme Builder templates; without Pro this plugin displays them
 * on every page (Hello Elementor hooks), so it must stay active.
 * Running it again updates what it created (tracked in the option OPTION).
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
// Contact form plugins (installed from wordpress.org)
const METFORM = array('slug' => 'metform', 'file' => 'metform/metform.php', 'name' => 'MetForm');
const CF7 = array('slug' => 'contact-form-7', 'file' => 'contact-form-7/wp-contact-form-7.php', 'name' => 'Contact Form 7');

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
	$defaults = array('images' => array(), 'pages' => array(), 'posts' => array(), 'templates' => array(), 'menu_items' => array(), 'form' => null, 'done_at' => 0);
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
		var run = function () {
			button.disabled = true;
			log.innerHTML = '';
			document.getElementById('esg-links').innerHTML = '';
			var status = line(cfg.ui.running);
			line(cfg.ui.setup);
			// Plugins / theme installed in the "setup" request are loaded by the following requests
			step('setup').then(function (r) {
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
			}).catch(function (e) {
				line(fmt(cfg.ui.failed, { message: e.message }), 'error');
			}).then(function () {
				button.disabled = false;
			});
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
		if ($step === 'images') {
			wp_send_json_success(import_images(IMAGES_PER_REQUEST));
		}
		if ($step === 'content') {
			$result = import_content();
			ob_start();
			render_links(created_links(state()));
			$result['linksHtml'] = ob_get_clean();
			wp_send_json_success($result);
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

/** Install (from wordpress.org) and activate a plugin. */
function ensure_plugin(array $plugin, array &$messages) {
	load_upgrader();
	if (is_plugin_active($plugin['file'])) {
		return true;
	}
	if (!file_exists(WP_PLUGIN_DIR . '/' . $plugin['file'])) {
		if (!current_user_can('install_plugins')) {
			$messages[] = array('level' => 'warning', 'text' => t('installFailed', array('name' => $plugin['name'], 'error' => 'permission denied')));
			return false;
		}
		$skin = new \WP_Ajax_Upgrader_Skin();
		$result = (new \Plugin_Upgrader($skin))->install('https://downloads.wordpress.org/plugin/' . $plugin['slug'] . '.latest-stable.zip');
		if (is_wp_error($result) || !$result) {
			$messages[] = array('level' => 'warning', 'text' => t('installFailed', array('name' => $plugin['name'], 'error' => upgrader_error($result, $skin))));
			return false;
		}
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
 * The templates are made for Hello Elementor. Block themes (e.g. Twenty Twenty-Five) do not show
 * Elementor headers/footers, and without Elementor Pro this plugin displays them through the Hello
 * Elementor hooks: in those cases the theme is switched (installed from wordpress.org if needed).
 * With Elementor Pro a classic theme chosen by the user is kept.
 */
function ensure_theme(array &$messages) {
	if (get_template() === 'hello-elementor') {
		return;
	}
	$block = function_exists('wp_is_block_theme') && wp_is_block_theme();
	if (!$block && (defined('ELEMENTOR_PRO_VERSION') || !has_header_footer())) {
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

/** First step: the theme and the contact form plugin (MetForm or Contact Form 7). No other addon. */
function setup_dependencies() {
	$messages = array();
	ensure_theme($messages);
	$form = data()['contactForm'];
	if (!empty($form)) {
		ensure_plugin($form['plugin'] === 'cf7' ? CF7 : METFORM, $messages);
	}
	return array('done' => true, 'messages' => $messages);
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
	}
	if ($img['alt'] !== '') {
		update_post_meta($id, '_wp_attachment_image_alt', wp_slash($img['alt']));
	}
	return $id;
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
			function ($m) {
				return $m[1] . home_url($m[2]);
			},
			$text
		);
	}
	return $text;
}

/**
 * Walk Elementor data: bundled images ("esg-image://file") -> Media Library id + URL,
 * nav menus -> the site menu, internal links -> absolute URLs, contact form placeholder -> real form.
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
		if (preg_match('/nav-menu|mega-menu|navigation-menu/', $node['widgetType'])) {
			$node['settings']['menu'] = $r['menu'];
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

function set_seo($post_id, $seo) {
	if (!empty($seo['title'])) {
		update_post_meta($post_id, '_yoast_wpseo_title', wp_slash($seo['title']));
		update_post_meta($post_id, 'rank_math_title', wp_slash($seo['title']));
	}
	if (!empty($seo['description'])) {
		update_post_meta($post_id, '_yoast_wpseo_metadesc', wp_slash($seo['description']));
		update_post_meta($post_id, 'rank_math_description', wp_slash($seo['description']));
	}
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
 * The contact form (created once, MetForm or Contact Form 7, mail sent to the site email) and its
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
	$known = (is_array($state['form']) && $state['form']['plugin'] === $cf['plugin']) ? (int) $state['form']['id'] : 0;
	$created = function ($id) use (&$state, &$messages, $cf) {
		$state['form'] = array('plugin' => $cf['plugin'], 'id' => (int) $id);
		save_state($state);
		$messages[] = array('level' => 'info', 'text' => t('formCreated', array('title' => $cf['title'], 'plugin' => $cf['name'], 'email' => $cf['recipient'])));
	};

	if ($cf['plugin'] === 'metform') {
		if (!post_type_exists('metform-form')) {
			$messages[] = array('level' => 'warning', 'text' => t('noForm', array('plugin' => $cf['name'])));
			return null;
		}
		$id = ($known && get_post($known)) ? $known : create_metform($cf);
		if ($id !== $known) {
			$created($id);
		}
		return '[metform form_id="' . $id . '"]';
	}

	if (!class_exists('WPCF7_ContactForm')) {
		$messages[] = array('level' => 'warning', 'text' => t('noForm', array('plugin' => $cf['name'])));
		return null;
	}
	$form = $known ? \WPCF7_ContactForm::get_instance($known) : null;
	if (!$form) {
		$form = \WPCF7_ContactForm::get_template(array('title' => $cf['title']));
		if (!empty($cf['recipient'])) {
			$props = $form->get_properties();
			$props['mail']['recipient'] = $cf['recipient'];
			$form->set_properties($props);
		}
		$form->save();
		$created($form->id());
	}
	return method_exists($form, 'shortcode') ? $form->shortcode() : sprintf('[contact-form-7 id="%d" title="%s"]', $form->id(), esc_attr($form->title()));
}

/** MetForm form: its fields are MetForm Elementor widgets, its settings send every message to the site email. */
function create_metform(array $cf) {
	$id = wp_insert_post(wp_slash(array('post_type' => 'metform-form', 'post_status' => 'publish', 'post_title' => $cf['title'])), true);
	if (is_wp_error($id)) {
		throw new \RuntimeException($id->get_error_message());
	}
	update_post_meta($id, '_wp_page_template', 'elementor_canvas');
	update_post_meta($id, '_elementor_edit_mode', 'builder');
	update_post_meta($id, '_elementor_template_type', 'wp-post');
	update_post_meta($id, '_elementor_version', defined('ELEMENTOR_VERSION') ? ELEMENTOR_VERSION : '3.0.0');
	update_post_meta($id, '_elementor_data', wp_slash(wp_json_encode($cf['elementor'])));
	update_post_meta($id, 'metform_form__form_setting', array(
		'form_title' => $cf['title'],
		'success_message' => $cf['success'],
		'store_entries' => 1,
		'enable_admin_notification' => 1,
		'admin_email_to' => $cf['recipient'],
		'admin_email_subject' => $cf['subject'],
		'admin_email_from' => get_option('admin_email'),
		'admin_email_reply_to' => $cf['recipient'],
	));
	return (int) $id;
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
			$content = '<figure class="wp-block-image size-large">' . wp_get_attachment_image($image, 'large') . '</figure>' . "
" . $content;
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
	}

	fill_menu($state, $menu, array_values($page_ids));

	// Header, footer and single post: Elementor Pro theme templates. Without Pro the theme document
	// types do not exist: the templates are saved as sections and this plugin displays header and footer.
	// The single post template is saved without display condition: the service articles are already
	// built with its design (it can be assigned by hand to articles written later).
	$pro = defined('ELEMENTOR_PRO_VERSION');
	$hf = array();
	foreach ($data['templates'] as $tpl) {
		$doc = element_doc($tpl['elementor']);
		if (!$doc) {
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
	} elseif ($hf) {
		update_option(OPTION_HF, $hf, true);
		$messages[] = array('level' => 'info', 'text' => t('hfReady'));
		if (get_template() !== 'hello-elementor') {
			$messages[] = array('level' => 'warning', 'text' => t('hfTheme'));
		}
	}

	apply_global_styles($data['globalStyles'], $messages);

	// Site settings: name, logo, static front page, "Post name" permalinks
	update_option('blogname', $data['site']['name']);
	if (!empty($data['logo']) && isset($images[$data['logo']])) {
		set_theme_mod('custom_logo', $images[$data['logo']]['id']);
	}
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

/** Colors and fonts of the template -> the global colors / fonts of the active Elementor kit. */
function apply_global_styles($styles, array &$messages) {
	$kit_id = (int) get_option('elementor_active_kit');
	if (!$styles || !$kit_id || !get_post($kit_id)) {
		return;
	}
	$current = get_post_meta($kit_id, '_elementor_page_settings', true);
	update_post_meta($kit_id, '_elementor_page_settings', wp_slash(array_merge(is_array($current) ? $current : array(), $styles)));
	delete_post_meta($kit_id, '_elementor_css');
	$messages[] = array('level' => 'info', 'text' => t('globalStyles'));
}
