import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;

class ApiClient {
  ApiClient({http.Client? client, String? baseUrl})
    : _client = client ?? http.Client(),
      baseUrl = baseUrl ?? _defaultBaseUrl;

  static const _configuredBaseUrl = String.fromEnvironment('API_BASE_URL');
  static String get _defaultBaseUrl {
    if (_configuredBaseUrl.isNotEmpty) return _configuredBaseUrl;
    return kIsWeb ? 'http://127.0.0.1:3000' : 'http://10.0.2.2:3000';
  }

  final http.Client _client;
  final String baseUrl;
  String? token;

  Future<Map<String, dynamic>> login(String email, String password) async {
    final response = await _send(
      'POST',
      '/api/auth/login',
      body: {'email': email, 'password': password},
    );
    token = response['token'] as String;
    return response;
  }

  Future<List<Product>> products() async {
    final response = await _send('GET', '/api/catalog/products');
    return (response as List)
        .map((item) => Product.fromJson(item as Map<String, dynamic>))
        .toList();
  }

  Future<Map<String, dynamic>> createOrder(
    List<Map<String, dynamic>> items,
    String address,
  ) async => (await _send(
    'POST',
    '/api/orders',
    body: {'items': items, 'deliveryAddress': address},
  )) as Map<String, dynamic>;

  Future<List<Map<String, dynamic>>> orders() async =>
      _asMaps(await _send('GET', '/api/orders'));

  Future<Map<String, dynamic>> travelQuote(
    String pickup,
    String destination,
  ) async => (await _send(
    'POST',
    '/api/travel/quote',
    body: {'pickup': pickup, 'destination': destination},
  )) as Map<String, dynamic>;

  Future<Map<String, dynamic>> createTravel(
    String pickup,
    String destination,
  ) async => (await _send(
    'POST',
    '/api/travel/requests',
    body: {'pickup': pickup, 'destination': destination},
  )) as Map<String, dynamic>;

  Future<List<Map<String, dynamic>>> supportThreads() async =>
      _asMaps(await _send('GET', '/api/support/threads'));

  Future<Map<String, dynamic>> supportThread(String id) async =>
      (await _send('GET', '/api/support/threads/$id')) as Map<String, dynamic>;

  Future<Map<String, dynamic>> createSupportThread(
    String subject,
    String message,
  ) async => (await _send(
    'POST',
    '/api/support/threads',
    body: {'subject': subject, 'message': message},
  )) as Map<String, dynamic>;

  Future<Map<String, dynamic>> sendSupportMessage(
    String threadId,
    String message,
  ) async => (await _send(
    'POST',
    '/api/support/threads/$threadId/messages',
    body: {'message': message},
  )) as Map<String, dynamic>;

  Future<List<Map<String, dynamic>>> payments() async =>
      _asMaps(await _send('GET', '/api/payments'));

  Future<Map<String, dynamic>> createPayment(
    String method,
    int amountCents, {
    String? orderId,
  }) async => (await _send(
    'POST',
    '/api/payments',
    body: {
      'method': method,
      'amountCents': amountCents,
      if (orderId != null) 'orderId': orderId,
    },
  )) as Map<String, dynamic>;

  List<Map<String, dynamic>> _asMaps(dynamic value) => (value as List)
      .map((item) => Map<String, dynamic>.from(item as Map))
      .toList();

  Future<dynamic> _send(
    String method,
    String path, {
    Map<String, dynamic>? body,
  }) async {
    final headers = {
      'content-type': 'application/json',
      if (token != null) 'authorization': 'Bearer $token',
    };
    final uri = Uri.parse('$baseUrl$path');
    final response = switch (method) {
      'POST' => await _client.post(
        uri,
        headers: headers,
        body: jsonEncode(body),
      ),
      _ => await _client.get(uri, headers: headers),
    };
    final decoded = response.body.isEmpty
        ? <String, dynamic>{}
        : jsonDecode(response.body) as Map<String, dynamic>;
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw ApiException(
        decoded['error']?['message']?.toString() ?? 'Backend request failed',
        response.statusCode,
      );
    }
    return decoded['data'];
  }
}

class ApiException implements Exception {
  const ApiException(this.message, [this.statusCode]);
  final String message;
  final int? statusCode;
  @override
  String toString() => message;
}

class Product {
  const Product({
    required this.id,
    required this.name,
    required this.merchant,
    required this.priceCents,
  });
  final String id;
  final String name;
  final String merchant;
  final int priceCents;

  factory Product.fromJson(Map<String, dynamic> json) => Product(
    id: json['id'] as String,
    name: json['name'] as String,
    merchant: json['merchantName'] as String? ?? '',
    priceCents: json['priceCents'] as int,
  );

  double get price => priceCents / 100;
}
