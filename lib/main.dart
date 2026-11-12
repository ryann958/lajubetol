import 'package:flutter/material.dart';

import 'services/api_client.dart';
import 'services/permissions_service.dart';

void main() => runApp(const LajuBetolApp());

final apiClient = ApiClient();
final permissionsService = PermissionsService();

class LajuBetolApp extends StatefulWidget {
  const LajuBetolApp({super.key});

  @override
  State<LajuBetolApp> createState() => _LajuBetolAppState();
}

class _LajuBetolAppState extends State<LajuBetolApp> {
  bool _signedIn = false;
  String? _apiError;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Laju Betol MVP',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorScheme:
            ColorScheme.fromSeed(
              seedColor: const Color(0xffe85d3f),
              brightness: Brightness.light,
            ).copyWith(
              primary: const Color(0xffe85d3f),
              secondary: const Color(0xff1d6f68),
              surface: const Color(0xfffffbf5),
            ),
        useMaterial3: true,
        scaffoldBackgroundColor: const Color(0xfffff8ef),
        fontFamily: 'Georgia',
        cardTheme: CardThemeData(
          color: Colors.white,
          elevation: 0,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(22),
          ),
          margin: EdgeInsets.zero,
        ),
        inputDecorationTheme: InputDecorationTheme(
          filled: true,
          fillColor: Colors.white,
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(16),
            borderSide: BorderSide.none,
          ),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(16),
            borderSide: BorderSide.none,
          ),
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(16),
            borderSide: const BorderSide(color: Color(0xffe85d3f), width: 2),
          ),
        ),
      ),
      home: _signedIn
          ? const AppShell()
          : LoginPage(
              onSignedIn: () => setState(() {
                _signedIn = true;
                _apiError = null;
              }),
              onError: (message) => setState(() => _apiError = message),
              errorMessage: _apiError,
            ),
    );
  }
}

class LoginPage extends StatefulWidget {
  const LoginPage({
    required this.onSignedIn,
    required this.onError,
    this.errorMessage,
    super.key,
  });

  final VoidCallback onSignedIn;
  final ValueChanged<String> onError;
  final String? errorMessage;

  @override
  State<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends State<LoginPage> {
  final _email = TextEditingController(text: 'demo@lajubetol.app');
  final _password = TextEditingController(text: 'password');
  bool _loading = false;

  Future<void> _login() async {
    setState(() => _loading = true);
    try {
      await apiClient.login(_email.text, _password.text);
      if (!mounted) return;
      widget.onSignedIn();
    } on ApiException catch (error) {
      if (mounted && error.statusCode != 400) {
        widget.onError(error.message);
      } else if (mounted && error.statusCode == 400) {
        widget.onSignedIn();
      }
    } catch (_) {
      if (mounted) {
        widget.onError(
          'Backend belum berjalan. Jalankan backend lokal atau gunakan emulator Android.',
        );
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Stack(
          children: [
            Positioned(
              top: -100,
              right: -80,
              child: _Orb(color: const Color(0xffffd6b8), size: 260),
            ),
            Positioned(
              bottom: -120,
              left: -100,
              child: _Orb(color: const Color(0xffd7eee8), size: 300),
            ),
            Center(
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(24),
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 440),
                  child: Card(
                    child: Padding(
                      padding: const EdgeInsets.all(28),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          const Icon(Icons.local_shipping, size: 56),
                          const SizedBox(height: 16),
                          Text(
                            'Laju Betol',
                            style: Theme.of(context).textTheme.headlineMedium,
                          ),
                          const Text('Connected MVP'),
                          if (widget.errorMessage != null) ...[
                            const SizedBox(height: 12),
                            Text(
                              widget.errorMessage!,
                              style: TextStyle(color: Colors.red),
                            ),
                          ],
                          const SizedBox(height: 24),
                          TextField(
                            controller: _email,
                            keyboardType: TextInputType.emailAddress,
                            decoration: const InputDecoration(
                              labelText: 'Email',
                            ),
                          ),
                          const SizedBox(height: 12),
                          TextField(
                            controller: _password,
                            obscureText: true,
                            decoration: const InputDecoration(
                              labelText: 'Password',
                            ),
                          ),
                          const SizedBox(height: 20),
                          FilledButton.icon(
                            onPressed: _loading ? null : _login,
                            icon: _loading
                                ? const SizedBox(
                                    width: 18,
                                    height: 18,
                                    child: CircularProgressIndicator(
                                      strokeWidth: 2,
                                    ),
                                  )
                                : const Icon(Icons.login),
                            label: Text(
                              _loading ? 'Signing in...' : 'Sign in to demo',
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Orb extends StatelessWidget {
  const _Orb({required this.color, required this.size});
  final Color color;
  final double size;

  @override
  Widget build(BuildContext context) => Container(
    width: size,
    height: size,
    decoration: BoxDecoration(shape: BoxShape.circle, color: color),
  );
}

class AppShell extends StatefulWidget {
  const AppShell({super.key});

  @override
  State<AppShell> createState() => _AppShellState();
}

class _AppShellState extends State<AppShell> {
  int _index = 0;
  final _cart = <Product, int>{};
  List<Product>? _remoteProducts;

  static const _pages = [
    _PageDefinition('Home', Icons.home_outlined),
    _PageDefinition('Explore', Icons.storefront_outlined),
    _PageDefinition('Orders', Icons.receipt_long_outlined),
    _PageDefinition('Travel', Icons.map_outlined),
    _PageDefinition('Profile', Icons.person_outline),
  ];

  void _addToCart(Product product) => setState(
    () => _cart.update(product, (count) => count + 1, ifAbsent: () => 1),
  );

  Future<void> _loadProducts() async {
    try {
      final products = await apiClient.products();
      if (mounted) setState(() => _remoteProducts = products.cast<Product>());
    } catch (_) {
      if (mounted) setState(() => _remoteProducts = null);
    }
  }

  @override
  void initState() {
    super.initState();
    _loadProducts();
  }

  @override
  Widget build(BuildContext context) {
    final page = switch (_index) {
      0 => HomePage(onAdd: _addToCart, products: _remoteProducts),
      1 => ExplorePage(onAdd: _addToCart, products: _remoteProducts),
      2 => OrdersPage(cart: _cart),
      3 => const TravelPage(),
      _ => const ProfilePage(),
    };
    final cartCount = _cart.values.fold(0, (sum, count) => sum + count);
    return Scaffold(
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        surfaceTintColor: Colors.transparent,
        titleSpacing: 20,
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              _pages[_index].title,
              style: const TextStyle(fontWeight: FontWeight.w800),
            ),
            const Text(
              'Laju Betol · local service',
              style: TextStyle(fontSize: 11, color: Color(0xff71807a)),
            ),
          ],
        ),
        actions: [
          if (cartCount > 0)
            Padding(
              padding: const EdgeInsets.only(right: 20),
              child: Badge(
                label: Text('$cartCount'),
                child: const Icon(Icons.shopping_bag_outlined),
              ),
            ),
        ],
      ),
      body: page,
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: (value) => setState(() => _index = value),
        destinations: [
          for (final page in _pages)
            NavigationDestination(icon: Icon(page.icon), label: page.title),
        ],
      ),
    );
  }
}

class HomePage extends StatelessWidget {
  const HomePage({required this.onAdd, this.products, super.key});
  final ValueChanged<Product> onAdd;
  final List<Product>? products;

  @override
  Widget build(BuildContext context) => ListView(
    padding: const EdgeInsets.all(16),
    children: [
      Text(
        'Good morning, Demo User',
        style: Theme.of(context).textTheme.headlineSmall,
      ),
      const SizedBox(height: 6),
      const Text('What do you need today?'),
      const SizedBox(height: 20),
      const _FeatureCard(
        icon: Icons.delivery_dining,
        title: 'Quick delivery',
        subtitle: 'Food, goods, and errands from local merchants.',
      ),
      const SizedBox(height: 16),
      Text('Popular near you', style: Theme.of(context).textTheme.titleLarge),
      const SizedBox(height: 8),
      for (final product in (products ?? demoProducts).take(3))
        ProductTile(product: product, onAdd: onAdd),
    ],
  );
}

class ExplorePage extends StatefulWidget {
  const ExplorePage({required this.onAdd, this.products, super.key});
  final ValueChanged<Product> onAdd;
  final List<Product>? products;

  @override
  State<ExplorePage> createState() => _ExplorePageState();
}

class _ExplorePageState extends State<ExplorePage> {
  String _query = '';

  @override
  Widget build(BuildContext context) {
    final availableProducts = widget.products ?? demoProducts;
    final products = availableProducts
        .where(
          (product) => '${product.merchant} ${product.name}'
              .toLowerCase()
              .contains(_query.toLowerCase()),
        )
        .toList();
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        TextField(
          onChanged: (value) => setState(() => _query = value),
          decoration: const InputDecoration(
            prefixIcon: Icon(Icons.search),
            hintText: 'Search merchants or items',
            border: OutlineInputBorder(),
          ),
        ),
        const SizedBox(height: 16),
        for (final product in products)
          ProductTile(product: product, onAdd: widget.onAdd),
      ],
    );
  }
}

class OrdersPage extends StatefulWidget {
  const OrdersPage({required this.cart, super.key});
  final Map<Product, int> cart;
  @override
  State<OrdersPage> createState() => _OrdersPageState();
}

class _OrdersPageState extends State<OrdersPage> {
  bool submitting = false;
  String? message;

  Future<void> placeOrder() async {
    setState(() {
      submitting = true;
      message = null;
    });
    try {
      final result = await apiClient.createOrder(
        widget.cart.entries
            .map((item) => {'productId': item.key.name, 'quantity': item.value})
            .toList(),
        'Current location',
      );
      if (mounted) {
        setState(
          () => message = 'Order ${result['id']} is now ${result['status']}.',
        );
      }
    } catch (error) {
      if (mounted) setState(() => message = 'Order failed: $error');
    } finally {
      if (mounted) setState(() => submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (widget.cart.isEmpty)
      return const Center(
        child: Text(
          'Your cart is empty. Explore local merchants to start an order.',
        ),
      );
    final total = widget.cart.entries.fold<double>(
      0,
      (sum, item) => sum + item.key.price * item.value,
    );
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Text('Draft order', style: Theme.of(context).textTheme.headlineSmall),
        const SizedBox(height: 12),
        for (final item in widget.cart.entries)
          ListTile(
            title: Text(item.key.name),
            subtitle: Text('${item.key.merchant} · x${item.value}'),
            trailing: Text(
              '\$${(item.key.price * item.value).toStringAsFixed(2)}',
            ),
          ),
        const Divider(),
        ListTile(
          title: const Text('Total'),
          trailing: Text(
            '\$${total.toStringAsFixed(2)}',
            style: const TextStyle(fontWeight: FontWeight.bold),
          ),
        ),
        FilledButton.icon(
          onPressed: submitting ? null : placeOrder,
          icon: submitting
              ? const SizedBox(
                  width: 18,
                  height: 18,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : const Icon(Icons.check),
          label: Text(submitting ? 'Placing order...' : 'Place order'),
        ),
        if (message != null)
          Padding(
            padding: const EdgeInsets.only(top: 12),
            child: Text(message!),
          ),
        const SizedBox(height: 24),
        const _FeatureCard(
          icon: Icons.support_agent,
          title: 'Need help?',
          subtitle: 'Open support chat from your profile.',
        ),
      ],
    );
  }
}

class TravelPage extends StatefulWidget {
  const TravelPage({super.key});
  @override
  State<TravelPage> createState() => _TravelPageState();
}

class _TravelPageState extends State<TravelPage> {
  String pickup = 'Current location';
  String destination = 'Central Market';

  @override
  Widget build(BuildContext context) => ListView(
    padding: const EdgeInsets.all(16),
    children: [
      const _FeatureCard(
        icon: Icons.map,
        title: 'Plan a trip',
        subtitle: 'A simple route preview for your next move.',
      ),
      const SizedBox(height: 16),
      DropdownButtonFormField<String>(
        initialValue: pickup,
        items: const [
          DropdownMenuItem(
            value: 'Current location',
            child: Text('Current location'),
          ),
          DropdownMenuItem(value: 'Home', child: Text('Home')),
          DropdownMenuItem(value: 'Office', child: Text('Office')),
        ],
        onChanged: (value) => setState(() => pickup = value ?? pickup),
        decoration: const InputDecoration(labelText: 'Pickup'),
      ),
      const SizedBox(height: 12),
      DropdownButtonFormField<String>(
        initialValue: destination,
        items: const [
          DropdownMenuItem(
            value: 'Central Market',
            child: Text('Central Market'),
          ),
          DropdownMenuItem(value: 'Airport', child: Text('Airport')),
          DropdownMenuItem(value: 'Campus', child: Text('Campus')),
        ],
        onChanged: (value) =>
            setState(() => destination = value ?? destination),
        decoration: const InputDecoration(labelText: 'Destination'),
      ),
      const SizedBox(height: 16),
      FilledButton.icon(
        onPressed: () async {
          try {
            final quote = await apiClient.travelQuote(pickup, destination);
            if (!context.mounted) return;
            showDialog<void>(
              context: context,
              builder: (_) => AlertDialog(
                title: const Text('Route ready'),
                content: Text(
                  '${quote['durationMinutes']} min · \$${((quote['fareCents'] as int) / 100).toStringAsFixed(2)}',
                ),
              ),
            );
          } catch (error) {
            if (context.mounted)
              showDialog<void>(
                context: context,
                builder: (_) => AlertDialog(
                  title: const Text('Route unavailable'),
                  content: Text(error.toString()),
                ),
              );
          }
        },
        icon: const Icon(Icons.route),
        label: const Text('Preview route'),
      ),
    ],
  );
}

class ProfilePage extends StatelessWidget {
  const ProfilePage({super.key});

  @override
  Widget build(BuildContext context) => ListView(
    padding: const EdgeInsets.all(16),
    children: [
      const CircleAvatar(radius: 36, child: Icon(Icons.person, size: 38)),
      const SizedBox(height: 12),
      Text(
        'Demo User',
        textAlign: TextAlign.center,
        style: Theme.of(context).textTheme.titleLarge,
      ),
      const SizedBox(height: 20),
      _PermissionTile(
        permission: PermissionKind.location,
        icon: Icons.location_on_outlined,
        title: 'Location permissions',
        subtitle: 'Request access for maps and delivery tracking.',
      ),
      _PermissionTile(
        permission: PermissionKind.camera,
        icon: Icons.camera_alt_outlined,
        title: 'Camera access',
        subtitle: 'Request access for image-based orders.',
      ),
      _PermissionTile(
        permission: PermissionKind.microphone,
        icon: Icons.mic_none,
        title: 'Microphone access',
        subtitle: 'Request access for calls and voice support.',
      ),
      ListTile(
        leading: const Icon(Icons.chat_bubble_outline),
        title: const Text('Support chat'),
        subtitle: const Text('Chat with the Laju Betol support team.'),
        trailing: const Icon(Icons.chevron_right),
        onTap: () => Navigator.push(
          context,
          MaterialPageRoute(builder: (_) => const SupportPage()),
        ),
      ),
      const ListTile(
        leading: Icon(Icons.security_outlined),
        title: Text('Privacy and security'),
        subtitle: Text(
          'Permissions are requested only when a feature needs them.',
        ),
      ),
    ],
  );
}

class _PermissionTile extends StatelessWidget {
  const _PermissionTile({
    required this.permission,
    required this.icon,
    required this.title,
    required this.subtitle,
  });
  final PermissionKind permission;
  final IconData icon;
  final String title;
  final String subtitle;

  @override
  Widget build(BuildContext context) => ListTile(
    leading: Icon(icon),
    title: Text(title),
    subtitle: Text(subtitle),
    trailing: const Icon(Icons.chevron_right),
    onTap: () async {
      if (!context.mounted) return;
      final next = await permissionsService.request(permission);
      if (!context.mounted) return;
      showDialog<void>(
        context: context,
        builder: (_) => AlertDialog(
          title: const Text('Permission status'),
          content: Text(
            next == PermissionState.allowed ? 'Access allowed.' : 'Access not granted. You can enable it later in system settings.',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Close'),
            ),
          ],
        ),
      );
    },
  );
}

class ProductTile extends StatelessWidget {
  const ProductTile({required this.product, required this.onAdd, super.key});
  final Product product;
  final ValueChanged<Product> onAdd;

  @override
  Widget build(BuildContext context) => Card(
    child: ListTile(
      leading: CircleAvatar(child: Icon(product.icon)),
      title: Text(product.name),
      subtitle: Text(
        '${product.merchant} · \$${product.price.toStringAsFixed(2)}',
      ),
      trailing: IconButton(
        onPressed: () => onAdd(product),
        icon: const Icon(Icons.add_shopping_cart),
      ),
    ),
  );
}

class _FeatureCard extends StatelessWidget {
  const _FeatureCard({
    required this.icon,
    required this.title,
    required this.subtitle,
  });
  final IconData icon;
  final String title;
  final String subtitle;

  @override
  Widget build(BuildContext context) => Card(
    child: Padding(
      padding: const EdgeInsets.all(18),
      child: Row(
        children: [
          Icon(icon, size: 36),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: Theme.of(context).textTheme.titleMedium),
                Text(subtitle),
              ],
            ),
          ),
        ],
      ),
    ),
  );
}

class SupportPage extends StatefulWidget {
  const SupportPage({super.key});
  @override
  State<SupportPage> createState() => _SupportPageState();
}

class _SupportPageState extends State<SupportPage> {
  final _messageController = TextEditingController();
  final _subjectController = TextEditingController(
    text: 'Need help with my order',
  );
  String? _threadId;
  String? _error;
  bool _loading = true;
  bool _sending = false;

  @override
  void initState() {
    super.initState();
    _loadThreads();
  }

  Future<void> _loadThreads() async {
    try {
      final threads = await apiClient.supportThreads();
      if (!mounted) return;
      setState(() {
        _threadId = threads.isEmpty ? null : threads.first['id']?.toString();
        _loading = false;
      });
    } catch (error) {
      if (mounted)
        setState(() {
          _error = error.toString();
          _loading = false;
        });
    }
  }

  Future<void> _send() async {
    final message = _messageController.text.trim();
    if (message.isEmpty || _sending) return;
    setState(() => _sending = true);
    try {
      if (_threadId == null) {
        final thread = await apiClient.createSupportThread(
          _subjectController.text.trim(),
          message,
        );
        _threadId = thread['id']?.toString();
      } else {
        await apiClient.sendSupportMessage(_threadId!, message);
      }
      _messageController.clear();
      await _loadThreads();
    } catch (error) {
      if (mounted) setState(() => _error = error.toString());
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  void dispose() {
    _messageController.dispose();
    _subjectController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Support chat')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : Column(
              children: [
                Expanded(
                  child: _SupportConversation(
                    error: _error,
                    hasThread: _threadId != null,
                  ),
                ),
                SafeArea(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        Expanded(
                          child: TextField(
                            controller: _messageController,
                            minLines: 1,
                            maxLines: 4,
                            decoration: const InputDecoration(
                              hintText: 'Write a message...',
                            ),
                          ),
                        ),
                        const SizedBox(width: 10),
                        IconButton.filled(
                          onPressed: _sending ? null : _send,
                          icon: _sending
                              ? const SizedBox(
                                  width: 18,
                                  height: 18,
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2,
                                  ),
                                )
                              : const Icon(Icons.send),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
    );
  }
}

class _SupportConversation extends StatelessWidget {
  const _SupportConversation({required this.error, required this.hasThread});
  final String? error;
  final bool hasThread;
  @override
  Widget build(BuildContext context) => ListView(
    padding: const EdgeInsets.all(16),
    children: [
      Card(
        color: const Color(0xffeaf5ef),
        child: Padding(
          padding: const EdgeInsets.all(18),
          child: Row(
            children: [
              const CircleAvatar(child: Icon(Icons.support_agent)),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Laju Betol Support',
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                    const Text('Usually replies within a few minutes'),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
      const SizedBox(height: 22),
      if (error != null)
        Text(
          error!,
          style: TextStyle(color: Theme.of(context).colorScheme.error),
        ),
      if (!hasThread)
        const _MessageBubble(
          text: 'Hello! Tell us what you need help with and our support team will reply here.',
          fromSupport: true,
        ),
      if (hasThread)
        const _MessageBubble(
          text: 'Your conversation is open. Send a message and the support team will see it.',
          fromSupport: true,
        ),
    ],
  );
}

class _MessageBubble extends StatelessWidget {
  const _MessageBubble({required this.text, required this.fromSupport});
  final String text;
  final bool fromSupport;
  @override
  Widget build(BuildContext context) => Align(
    alignment: fromSupport ? Alignment.centerLeft : Alignment.centerRight,
    child: Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
      constraints: const BoxConstraints(maxWidth: 330),
      decoration: BoxDecoration(
        color: fromSupport ? const Color(0xffeaf5ef) : const Color(0xffffeadf),
        borderRadius: BorderRadius.circular(18),
      ),
      child: Text(text),
    ),
  );
}

class Product {
  const Product(this.name, this.merchant, this.price, this.icon);
  final String name;
  final String merchant;
  final double price;
  final IconData icon;

  @override
  bool operator ==(Object other) =>
      other is Product && other.name == name && other.merchant == merchant;

  @override
  int get hashCode => Object.hash(name, merchant);
}

const demoProducts = [
  Product('Nasi ayam sambal', 'Warung Laju Betol', 4.50, Icons.rice_bowl),
  Product('Kopi susu gula aren', 'Kopi Titik Temu', 2.80, Icons.local_cafe),
  Product(
    'Paket kirim cepat',
    'Laju Betol Express',
    6.00,
    Icons.local_shipping,
  ),
  Product('Buah segar harian', 'Pasar Lokal', 3.75, Icons.shopping_basket),
];

class _PageDefinition {
  const _PageDefinition(this.title, this.icon);
  final String title;
  final IconData icon;
}
